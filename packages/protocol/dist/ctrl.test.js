"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var strict_1 = __importDefault(require("node:assert/strict"));
var node_test_1 = require("node:test");
var ctrl_1 = require("./ctrl");
function roundTrip(msg) {
    var text = (0, ctrl_1.encodeCtrl)(msg);
    var _a = (0, ctrl_1.parseCtrl)(text), message = _a.message, error = _a.error;
    strict_1.default.strictEqual(error, null, "unexpected error: ".concat(error));
    strict_1.default.deepStrictEqual(message, msg);
}
(0, node_test_1.describe)('ctrl parse', function () {
    (0, node_test_1.it)('round-trips hello', function () {
        roundTrip({ t: 'hello', v: 1, token: '482913', sampleRate: 48000, channels: 1, codec: 'pcm16', frameMs: 10 });
    });
    (0, node_test_1.it)('round-trips welcome', function () {
        roundTrip({ t: 'welcome', sessionId: 'c1f0', audioPort: 41235, targetBufferMs: 30 });
    });
    (0, node_test_1.it)('round-trips mute true and false', function () {
        roundTrip({ t: 'mute', value: true });
        roundTrip({ t: 'mute', value: false });
    });
    (0, node_test_1.it)('round-trips volume', function () {
        roundTrip({ t: 'volume', value: 1.2 });
        roundTrip({ t: 'volume', value: 0 });
        roundTrip({ t: 'volume', value: 4 });
    });
    (0, node_test_1.it)('round-trips bye', function () {
        roundTrip({ t: 'bye' });
    });
    (0, node_test_1.it)('round-trips stats', function () {
        roundTrip({ t: 'stats', lossPct: 0.4, bufferMs: 32, seqGaps: 12, reconnects: 0 });
    });
    (0, node_test_1.it)('round-trips error', function () {
        roundTrip({ t: 'error', code: 'bad_token', message: 'código inválido' });
    });
    (0, node_test_1.it)('rejects invalid json', function () {
        var _a = (0, ctrl_1.parseCtrl)('{not json'), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
    (0, node_test_1.it)('rejects oversize message', function () {
        var big = 'x'.repeat(2000);
        var _a = (0, ctrl_1.parseCtrl)(big), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
    (0, node_test_1.it)('rejects missing t', function () {
        var _a = (0, ctrl_1.parseCtrl)(JSON.stringify({ v: 1 })), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
    (0, node_test_1.it)('rejects unknown t', function () {
        var _a = (0, ctrl_1.parseCtrl)(JSON.stringify({ t: 'bogus' })), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
    (0, node_test_1.it)('rejects hello missing fields', function () {
        var _a = (0, ctrl_1.parseCtrl)(JSON.stringify({ t: 'hello', v: 1 })), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
    (0, node_test_1.it)('rejects non-object', function () {
        var _a = (0, ctrl_1.parseCtrl)('[1,2,3]'), message = _a.message, error = _a.error;
        strict_1.default.strictEqual(message, null);
        strict_1.default.ok(error);
    });
});
