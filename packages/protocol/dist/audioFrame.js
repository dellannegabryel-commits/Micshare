"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeAudioFrame = encodeAudioFrame;
exports.decodeAudioFrame = decodeAudioFrame;
exports.isMuteFlag = isMuteFlag;
exports.isSilenceFlag = isSilenceFlag;
var constants_1 = require("./constants");
function encodeAudioFrame(frame) {
    var seq = frame.seq, captureTs = frame.captureTs, flags = frame.flags, payloadLen = frame.payloadLen, channels = frame.channels, codec = frame.codec, payload = frame.payload;
    if (payload.length !== payloadLen) {
        throw new Error("payload.length ".concat(payload.length, " !== declared payloadLen ").concat(payloadLen));
    }
    if (payloadLen > constants_1.MAX_PAYLOAD_LEN) {
        throw new Error("payloadLen ".concat(payloadLen, " exceeds max ").concat(constants_1.MAX_PAYLOAD_LEN));
    }
    if (channels !== 1) {
        throw new Error("only mono supported, got ".concat(channels, " channels"));
    }
    if (codec !== 0 && codec !== 1) {
        throw new Error("codec ".concat(codec, " n\u00E3o suportado"));
    }
    var buf = Buffer.alloc(constants_1.HEADER_SIZE + payloadLen);
    buf.writeUInt16BE(constants_1.MAGIC, 0);
    buf.writeUInt8(constants_1.VERSION, 2);
    buf.writeUInt8(flags, 3);
    buf.writeUInt32BE(seq >>> 0, 4);
    buf.writeUInt32BE(captureTs >>> 0, 8);
    buf.writeUInt16BE(payloadLen, 12);
    buf.writeUInt8(channels, 14);
    buf.writeUInt8(codec, 15);
    payload.copy(buf, constants_1.HEADER_SIZE);
    return buf;
}
function decodeAudioFrame(buf) {
    if (buf.length < constants_1.HEADER_SIZE)
        return null;
    if (buf.readUInt16BE(0) !== constants_1.MAGIC)
        return null;
    if (buf.readUInt8(2) !== constants_1.VERSION)
        return null;
    var flags = buf.readUInt8(3);
    var seq = buf.readUInt32BE(4);
    var captureTs = buf.readUInt32BE(8);
    var payloadLen = buf.readUInt16BE(12);
    var channels = buf.readUInt8(14);
    var codec = buf.readUInt8(15);
    if (payloadLen > constants_1.MAX_PAYLOAD_LEN)
        return null;
    if (channels !== 1)
        return null;
    if (codec !== 0 && codec !== 1)
        return null;
    if (buf.length < constants_1.HEADER_SIZE + payloadLen)
        return null;
    var payload = buf.subarray(constants_1.HEADER_SIZE, constants_1.HEADER_SIZE + payloadLen);
    return {
        header: { seq: seq, captureTs: captureTs, flags: flags, payloadLen: payloadLen, channels: channels, codec: codec },
        payload: payload,
        offset: constants_1.HEADER_SIZE + payloadLen,
    };
}
function isMuteFlag(flags) {
    return (flags & constants_1.FLAG_MUTED) !== 0;
}
function isSilenceFlag(flags) {
    return (flags & constants_1.FLAG_SILENCE) !== 0;
}
