import { io } from 'socket.io-client';
import { API_URL } from './api';

let socket = null;
export function getSocket() {
  if (!socket) {
    socket = io(API_URL || undefined, { auth: (cb) => cb({ token: localStorage.getItem('apex_token') }), transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 5000 });
  }
  return socket;
}
export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
