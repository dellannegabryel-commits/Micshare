"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCtrl = parseCtrl;
exports.encodeCtrl = encodeCtrl;
function parseCtrl(text) {
    if (Buffer.byteLength(text) > 1024) {
        return { message: null, error: 'message too large' };
    }
    var parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_a) {
        return { message: null, error: 'invalid json' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { message: null, error: 'not an object' };
    }
    var obj = parsed;
    var t = obj.t;
    if (typeof t !== 'string') {
        return { message: null, error: 'missing t field' };
    }
    switch (t) {
        case 'hello': {
            if (typeof obj.v !== 'number' ||
                typeof obj.token !== 'string' ||
                typeof obj.sampleRate !== 'number' ||
                typeof obj.channels !== 'number' ||
                typeof obj.codec !== 'string' ||
                typeof obj.frameMs !== 'number') {
                return { message: null, error: 'hello missing fields' };
            }
            return {
                message: {
                    t: 'hello',
                    v: obj.v,
                    token: obj.token,
                    sampleRate: obj.sampleRate,
                    channels: obj.channels,
                    codec: obj.codec,
                    frameMs: obj.frameMs,
                },
                error: null,
            };
        }
        case 'welcome': {
            if (typeof obj.sessionId !== 'string' ||
                typeof obj.audioPort !== 'number' ||
                typeof obj.targetBufferMs !== 'number') {
                return { message: null, error: 'welcome missing fields' };
            }
            return { message: { t: 'welcome', sessionId: obj.sessionId, audioPort: obj.audioPort, targetBufferMs: obj.targetBufferMs }, error: null };
        }
        case 'mute': {
            if (typeof obj.value !== 'boolean') {
                return { message: null, error: 'mute missing value' };
            }
            return { message: { t: 'mute', value: obj.value }, error: null };
        }
        case 'volume': {
            if (typeof obj.value !== 'number') {
                return { message: null, error: 'volume missing value' };
            }
            return { message: { t: 'volume', value: obj.value }, error: null };
        }
        case 'bye':
            return { message: { t: 'bye' }, error: null };
        case 'stats': {
            if (typeof obj.lossPct !== 'number' ||
                typeof obj.bufferMs !== 'number' ||
                typeof obj.seqGaps !== 'number' ||
                typeof obj.reconnects !== 'number') {
                return { message: null, error: 'stats missing fields' };
            }
            return { message: { t: 'stats', lossPct: obj.lossPct, bufferMs: obj.bufferMs, seqGaps: obj.seqGaps, reconnects: obj.reconnects }, error: null };
        }
        case 'error': {
            if (typeof obj.code !== 'string' || typeof obj.message !== 'string') {
                return { message: null, error: 'error missing fields' };
            }
            return { message: { t: 'error', code: obj.code, message: obj.message }, error: null };
        }
        default:
            return { message: null, error: "unknown t: ".concat(t) };
    }
}
function encodeCtrl(message) {
    return JSON.stringify(message);
}
