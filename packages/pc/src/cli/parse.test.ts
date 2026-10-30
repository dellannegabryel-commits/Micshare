import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generatePairingCode,
  parseLine,
  parseMuteArg,
  parseRestartScope,
  parseVolumeArg,
  tokenize,
} from './parse.js';

describe('tokenize', () => {
  it('separa por espaços', () => {
    assert.deepEqual(tokenize('mute on'), ['mute', 'on']);
  });

  it('respeita aspas duplas', () => {
    assert.deepEqual(tokenize('device "CABLE Input"'), ['device', 'CABLE Input']);
  });

  it('respeita aspas simples', () => {
    assert.deepEqual(tokenize("device 'Fones de Ouvido'"), ['device', 'Fones de Ouvido']);
  });

  it('mantém token vazio entre aspas', () => {
    assert.deepEqual(tokenize('volume ""'), ['volume', '']);
  });

  it('aceita escape dentro de aspas duplas', () => {
    assert.deepEqual(tokenize('device "CABLE \\"Input\\""'), ['device', 'CABLE "Input"']);
  });

  it('colapsa espaços múltiplos', () => {
    assert.deepEqual(tokenize('  status   --json  '), ['status', '--json']);
  });

  it('rejeita aspas não fechadas', () => {
    assert.throws(() => tokenize('device "CABLE'), /aspas não fechadas/);
  });
});

describe('parseLine', () => {
  it('devolve comando em minúsculas', () => {
    assert.deepEqual(parseLine('STATUS'), { command: 'status', args: [] });
  });

  it('linha vazia devolve null', () => {
    assert.equal(parseLine('   '), null);
  });
});

describe('parseMuteArg', () => {
  it('sem argumento é toggle', () => {
    assert.equal(parseMuteArg(undefined), 'toggle');
  });

  it('aceita on/off e sinônimos', () => {
    assert.equal(parseMuteArg('on'), 'on');
    assert.equal(parseMuteArg('TRUE'), 'on');
    assert.equal(parseMuteArg('0'), 'off');
  });

  it('rejeita valor desconhecido', () => {
    assert.throws(() => parseMuteArg('talvez'), /valor inválido/);
  });
});

describe('parseVolumeArg', () => {
  it('aceita valor absoluto', () => {
    assert.equal(parseVolumeArg('2', 1), 2);
    assert.equal(parseVolumeArg('1.5', 1), 1.5);
  });

  it('aceita valor relativo', () => {
    assert.equal(parseVolumeArg('+0.5', 1), 1.5);
    assert.equal(parseVolumeArg('-0.25', 1), 0.75);
  });

  it('faz clamp em 0..4', () => {
    assert.equal(parseVolumeArg('10', 1), 4);
    assert.equal(parseVolumeArg('-10', 1), 0);
  });

  it('rejeita texto', () => {
    assert.throws(() => parseVolumeArg('alto', 1), /valor inválido/);
  });
});

describe('parseRestartScope', () => {
  it('sem flags é all', () => {
    assert.equal(parseRestartScope([]), 'all');
  });

  it('entende cada flag', () => {
    assert.equal(parseRestartScope(['--sink']), 'sink');
    assert.equal(parseRestartScope(['--control']), 'control');
    assert.equal(parseRestartScope(['--beacon']), 'beacon');
    assert.equal(parseRestartScope(['--all']), 'all');
  });

  it('múltiplos escopos viram all', () => {
    assert.equal(parseRestartScope(['--sink', '--beacon']), 'all');
  });

  it('rejeita flag desconhecida', () => {
    assert.throws(() => parseRestartScope(['--tudo']), /argumento inválido/);
  });
});

describe('generatePairingCode', () => {
  it('gera 6 dígitos', () => {
    for (let i = 0; i < 20; i++) assert.match(generatePairingCode(), /^\d{6}$/);
  });
});
