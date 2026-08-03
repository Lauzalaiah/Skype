/** Client WebSocket : reconnexion automatique et distribution des événements. */
import { urlSocket } from './serveur.js';
import { getToken } from './api.js';

export class Socket extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.connected = false;
    this.attempts = 0;
    this.queue = [];
    this.closing = false;
    this._heartbeat = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const token = getToken();
    if (!token) return;

    this.closing = false;
    this.ws = new WebSocket(urlSocket(`/ws?token=${encodeURIComponent(token)}`));

    this.ws.onopen = () => {
      this.connected = true;
      this.attempts = 0;
      this.emit('open');
      // Rejoue ce qui a été mis en file pendant la coupure.
      const pending = this.queue.splice(0);
      for (const message of pending) this.send(message);
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      this.emit(data.type, data);
      this.emit('*', data);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._stopHeartbeat();
      this.emit('close');
      if (!this.closing) this._scheduleReconnect();
    };

    this.ws.onerror = () => this.emit('error');
  }

  _scheduleReconnect() {
    this.attempts++;
    // Attente exponentielle plafonnée à 15 s, avec un peu d'aléa.
    const delay = Math.min(1000 * 2 ** Math.min(this.attempts, 4), 15000) + Math.random() * 500;
    this.emit('reconnecting', { attempt: this.attempts, delay });
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeat = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 25000);
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeat);
    this._heartbeat = null;
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    // Les signaux d'appel périmés n'ont aucun intérêt à être rejoués.
    if (!String(message.type).startsWith('call:')) this.queue.push(message);
    return false;
  }

  disconnect() {
    this.closing = true;
    clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Abonnement ; renvoie la fonction de désabonnement. */
  on(type, handler) {
    const wrapped = (event) => handler(event.detail);
    this.addEventListener(type, wrapped);
    return () => this.removeEventListener(type, wrapped);
  }
}

export const socket = new Socket();
