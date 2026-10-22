"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var strict_1 = __importDefault(require("node:assert/strict"));
var node_test_1 = require("node:test");
var index_1 = require("./index");
function makePayload(len) {
    var buf = Buffer.alloc(len);
    for (var i = 0; i < len; i++)
        buf[i] = i % 256;
    return buf;
}
(0, node_test_1.describe)('audioFrame round-trip', function () {
    (0, node_test_1.it)('encodes and decodes a full PCM frame', function () {
        var payload = makePayload(index_1.PCM_BYTES_PER_FRAME);
        var encoded = (0, index_1.encodeAudioFrame)({ seq: 1, captureTs: 1000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload: payload });
        var decoded = (0, index_1.decodeAudioFrame)(encoded);
        strict_1.default.ok(decoded !== null);
        strict_1.default.deepStrictEqual(decoded.header, { seq: 1, captureTs: 1000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0 });
        strict_1.default.strictEqual(decoded.offset, encoded.length);
        strict_1.default.deepStrictEqual(decoded.payload, payload);
    });
    (0, node_test_1.it)('round-trips mute and silence flags', function () {
        var payload = makePayload(10);
        var enc = (0, index_1.encodeAudioFrame)({ seq: 2, captureTs: 2000, flags: 3, payloadLen: payload.length, channels: 1, codec: 0, payload: payload });
        var dec = (0, index_1.decodeAudioFrame)(enc);
        strict_1.default.ok(dec);
        strict_1.default.strictEqual((0, index_1.isMuteFlag)(dec.header.flags), true);
        strict_1.default.strictEqual((0, index_1.isSilenceFlag)(dec.header.flags), true);
    });
    (0, node_test_1.it)('rejects bad magic', function () {
        var buf = Buffer.alloc(index_1.HEADER_SIZE + 10);
        buf.writeUInt16BE(0x0000, 0);
        buf.writeUInt8(index_1.VERSION, 2);
        strict_1.default.strictEqual((0, index_1.decodeAudioFrame)(buf), null);
    });
    (0, node_test_1.it)('rejects bad version', function () {
        var buf = Buffer.alloc(index_1.HEADER_SIZE + 10);
        buf.writeUInt16BE(index_1.MAGIC, 0);
        buf.writeUInt8(99, 2);
        strict_1.default.strictEqual((0, index_1.decodeAudioFrame)(buf), null);
    });
    (0, node_test_1.it)('rejects payloadLen larger than actual buffer', function () {
        var buf = Buffer.alloc(index_1.HEADER_SIZE + 5);
        buf.writeUInt16BE(index_1.MAGIC, 0);
        buf.writeUInt8(index_1.VERSION, 2);
        buf.writeUInt16BE(100, 12); // claims 100 bytes, only 5 present
        strict_1.default.strictEqual((0, index_1.decodeAudioFrame)(buf), null);
    });
    (0, node_test_1.it)('rejects payloadLen exceeding MTU bound', function () {
        var payload = makePayload(index_1.MAX_PAYLOAD_LEN + 1);
        strict_1.default.throws(function () { return (0, index_1.encodeAudioFrame)({ seq: 3, captureTs: 3000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload: payload }); }, /exceeds max/);
    });
    (0, node_test_1.it)('rejects non-mono channels', function () {
        var payload = makePayload(10);
        strict_1.default.throws(function () { return (0, index_1.encodeAudioFrame)({ seq: 4, captureTs: 4000, flags: 0, payloadLen: payload.length, channels: 2, codec: 0, payload: payload }); }, /only mono/);
    });
    (0, node_test_1.it)('rejects unknown codec', function () {
        var payload = makePayload(10);
        strict_1.default.throws(function () { return (0, index_1.encodeAudioFrame)({ seq: 5, captureTs: 5000, flags: 0, payloadLen: payload.length, channels: 1, codec: 99, payload: payload }); }, /não suportado/);
    });
    (0, node_test_1.it)('seq wraps at u32 max', function () {
        var payload = makePayload(10);
        var enc = (0, index_1.encodeAudioFrame)({ seq: 0xffffffff, captureTs: 6000, flags: 0, payloadLen: payload.length, channels: 1, codec: 0, payload: payload });
        var dec = (0, index_1.decodeAudioFrame)(enc);
        strict_1.default.ok(dec);
        strict_1.default.strictEqual(dec.header.seq, 0xffffffff);
    });
    (0, node_test_1.it)('buffer shorter than header returns null', function () {
        strict_1.default.strictEqual((0, index_1.decodeAudioFrame)(Buffer.alloc(index_1.HEADER_SIZE - 1)), null);
    });
});
