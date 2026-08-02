/**
 * Implémentation WebSocket (RFC 6455) sans aucune dépendance.
 * Gère le handshake, le masquage, la fragmentation, ping/pong et la fermeture.
 */
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024 * 1024; // 64 Mo (pièces jointes en base64)

const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

export class WebSocketConnection extends EventEmitter {
  constructor(socket, request) {
    super();
    this.socket = socket;
    this.request = request;
    this.readyState = 'open';
    this.isAlive = true;
    this.data = {}; // espace libre pour l'application (userId, etc.)

    this._buffer = Buffer.alloc(0);
    this._fragments = [];
    this._fragmentOpcode = null;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', (err) => {
      this.emit('error', err);
      this.destroy();
    });
    socket.on('close', () => this._onClose());
    socket.setTimeout(0);
    socket.setNoDelay(true);
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    // Boucle : un paquet TCP peut contenir plusieurs trames, ou une trame partielle.
    while (this._buffer.length >= 2) {
      const frame = this._parseFrame();
      if (!frame) break; // trame incomplète, on attend la suite
      this._handleFrame(frame);
    }
  }

  _parseFrame() {
    const buf = this._buffer;
    const first = buf[0];
    const second = buf[1];

    const fin = (first & 0x80) === 0x80;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) === 0x80;
    let payloadLength = second & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buf.length < offset + 2) return null;
      payloadLength = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (buf.length < offset + 8) return null;
      const big = buf.readBigUInt64BE(offset);
      if (big > BigInt(MAX_PAYLOAD)) {
        this.close(1009, 'Message trop volumineux');
        return null;
      }
      payloadLength = Number(big);
      offset += 8;
    }

    if (payloadLength > MAX_PAYLOAD) {
      this.close(1009, 'Message trop volumineux');
      return null;
    }

    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + payloadLength) return null;

    const payload = Buffer.from(buf.subarray(offset, offset + payloadLength));
    if (maskKey) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
    }

    this._buffer = buf.subarray(offset + payloadLength);
    return { fin, opcode, payload };
  }

  _handleFrame({ fin, opcode, payload }) {
    switch (opcode) {
      case OPCODE.PING:
        this._send(OPCODE.PONG, payload);
        break;

      case OPCODE.PONG:
        this.isAlive = true;
        break;

      case OPCODE.CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : '';
        this.close(code === 1005 ? 1000 : code, reason);
        break;
      }

      case OPCODE.CONTINUATION:
        this._fragments.push(payload);
        if (fin) this._emitMessage(this._fragmentOpcode, Buffer.concat(this._fragments));
        break;

      case OPCODE.TEXT:
      case OPCODE.BINARY:
        if (fin) {
          this._emitMessage(opcode, payload);
        } else {
          this._fragmentOpcode = opcode;
          this._fragments = [payload];
        }
        break;

      default:
        this.close(1002, 'Opcode inconnu');
    }
  }

  _emitMessage(opcode, payload) {
    this._fragments = [];
    this._fragmentOpcode = null;
    this.isAlive = true;
    if (opcode === OPCODE.TEXT) {
      const text = payload.toString('utf8');
      this.emit('message', text);
      try {
        this.emit('json', JSON.parse(text));
      } catch {
        /* message non-JSON : ignoré par la couche applicative */
      }
    } else {
      this.emit('binary', payload);
    }
  }

  _send(opcode, payload) {
    // Une trame CLOSE doit encore pouvoir partir pendant la fermeture :
    // sans elle, le pair ne reçoit aucun code et voit une coupure brutale (1006).
    const allowed = this.readyState === 'open' || (this.readyState === 'closing' && opcode === OPCODE.CLOSE);
    if (!allowed || this.socket.destroyed) return false;

    const length = payload.length;
    let header;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode; // FIN + opcode (le serveur ne masque jamais)

    try {
      this.socket.write(Buffer.concat([header, payload]));
      return true;
    } catch {
      this.destroy();
      return false;
    }
  }

  send(data) {
    if (typeof data === 'string') return this._send(OPCODE.TEXT, Buffer.from(data, 'utf8'));
    if (Buffer.isBuffer(data)) return this._send(OPCODE.BINARY, data);
    return this._send(OPCODE.TEXT, Buffer.from(JSON.stringify(data), 'utf8'));
  }

  ping() {
    this.isAlive = false;
    this._send(OPCODE.PING, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== 'open') return;
    this.readyState = 'closing';
    const reasonBuf = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    this._send(OPCODE.CLOSE, payload);
    setTimeout(() => this.destroy(), 200);
  }

  destroy() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    try {
      this.socket.destroy();
    } catch {
      /* déjà fermé */
    }
    this.emit('close');
  }

  _onClose() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.emit('close');
  }
}

export class WebSocketServer extends EventEmitter {
  constructor({ server, path = '/ws', heartbeat = 30000 } = {}) {
    super();
    this.clients = new Set();
    this.path = path;

    server.on('upgrade', (req, socket, head) => this._onUpgrade(req, socket, head));

    this._heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.destroy();
          continue;
        }
        client.ping();
      }
    }, heartbeat);
    this._heartbeat.unref?.();
  }

  _onUpgrade(req, socket, head) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== this.path) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const conn = new WebSocketConnection(socket, req);
    if (head?.length) conn._onData(head);

    this.clients.add(conn);
    conn.on('close', () => this.clients.delete(conn));
    this.emit('connection', conn, req, url);
  }

  broadcast(data) {
    for (const client of this.clients) client.send(data);
  }

  close() {
    clearInterval(this._heartbeat);
    for (const client of this.clients) client.close(1001, 'Serveur arrêté');
  }
}
