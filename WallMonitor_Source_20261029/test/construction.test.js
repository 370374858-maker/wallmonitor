import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSlot, calculateRecord, nextTruckNo, sidesFor, ValidationError } from '../shared/construction.js';

const slotInput = (count = 2, layout = 'both') => ({ code: 'C-测试', width: 6, depth: 200, thickness: 1.8,
  tremieCount: count, tremieInitialDepths: Array(count).fill(200), jointLayout: layout,
  jointInitialDepths: Object.fromEntries(sidesFor(layout).map(side => [side, 200])) });
const raw = slot => ({ truckNo: 1, volume: 15, startedAt: '2026-09-07T10:00', endedAt: '2026-09-07T11:00',
  measurementPoints: [198, 197, 196, 199, 200, 198], tremiePulls: Array(slot.tremieCount).fill(0),
  jointPulls: Object.fromEntries(sidesFor(slot.jointLayout).map(side => [side, 0])) });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('下一车号取本槽最大已存整数加一，不依赖记录时序', () => {
  assert.equal(nextTruckNo([]), 1);
  assert.equal(nextTruckNo([{ truckNo: 8 }, { truckNo: 3 }, { truckNo: 11 }]), 12);
  assert.equal(nextTruckNo([4, 9, 2]), 10);
});

for (const count of [1, 2, 3]) for (const layout of ['none', 'left', 'right', 'both']) {
  test(`参数、截面、模型和记录：${count} 根浇筑管 / ${layout}`, () => {
    const slot = calculateSlot(slotInput(count, layout));
    near(slot.area, 6 * 1.8 - sidesFor(layout).length * Math.PI * .465 ** 2 / 2);
    assert.equal(slot.jointDiameter, layout === 'none' ? null : .93);
    assert.equal(slot.tremieDiameter, .3);
    assert.equal(slot.initialConcreteHeight, 0);
    assert.equal(slot.model.initialConcreteHeight, 0);
    assert.equal(slot.model.pipes.filter(p => p.kind === 'tremie').length, count);
    assert.equal(slot.model.pipes.filter(p => p.kind === 'joint').length, sidesFor(layout).length);
    for (const p of slot.model.pipes.filter(p => p.kind === 'joint')) assert.equal(p.x, p.side === 'left' ? 0 : slot.width);
    assert.equal(slot.model.dimensions.depth, 200);
                                                                                         
    const polygon = slot.model.profile;
    const polygonArea = Math.abs(polygon.reduce((sum, [x, z], i) => {
      const [nextX, nextZ] = polygon[(i + 1) % polygon.length];
      assert.ok(x >= 0 && x <= slot.width && z >= 0 && z <= slot.thickness);
      return sum + x * nextZ - nextX * z;
    }, 0)) / 2;
                                                                             
    assert.ok(polygonArea >= slot.area - 1e-7);
    assert.ok(polygonArea - slot.area <= Math.max(1e-7, slot.deductionArea * .004));
    const tremies = slot.model.pipes.filter(p => p.kind === 'tremie');
    assert.equal(new Set(tremies.map(p => p.x)).size, count);
    for (const pipe of tremies) {
      assert.equal(pipe.diameter, .3);
      assert.ok(pipe.x - .15 >= (sidesFor(layout).includes('left') ? slot.jointDiameter / 2 : 0));
      assert.ok(pipe.x + .15 <= slot.width - (sidesFor(layout).includes('right') ? slot.jointDiameter / 2 : 0));
    }
    const result = calculateRecord(slot, raw(slot));
    assert.equal(result.raw.measurementPoints.length, 6);
    assert.equal(result.metrics.actualDepth, 198);
    assert.equal(result.metrics.actualHeight, 2);
    assert.equal(result.metrics.actualSpeed, 2);
    assert.equal(result.metrics.actualRiseFromInitial, 2);
    near(result.metrics.cumulativeVolume, 15);
    near(result.metrics.theoreticalDepth, 200 - 15 / slot.area);
    assert.deepEqual(result.metrics.tremieDepths, Array(count).fill(200));
    assert.deepEqual(Object.keys(result.metrics.jointDepths), sidesFor(layout));
  });
}

test('第二车读取前序结果，累计方量/拔管长度并计算实测速度', () => {
  const slot = calculateSlot(slotInput());
  const firstInput = { ...raw(slot), tremiePulls: [3, 4], jointPulls: { left: 5, right: 6 } };
  const first = calculateRecord(slot, firstInput);
  const second = calculateRecord(slot, { ...raw(slot), truckNo: 2, volume: 20,
    startedAt: '2026-09-07T11:00', endedAt: '2026-09-07T12:00',
    measurementPoints: Array(6).fill(196), tremiePulls: [7, 6], jointPulls: { left: 0, right: 2 } },
  { ...first.raw, metrics: first.metrics });
  assert.equal(second.metrics.cumulativeVolume, 35);
  assert.equal(second.metrics.actualSpeed, 2);
  assert.deepEqual(second.metrics.tremieDepths, [190, 190]);
  assert.deepEqual(second.metrics.jointDepths, { left: 195, right: 192 });
  assert.deepEqual(second.metrics.tremieEmbedments, [0, 0]);
  assert.equal(second.metrics.evaluatedAt, '2026-09-07 12:00:00');
});

test('六点缺少任意一个、未填写拔管量、不匹配配置均不可提交', () => {
  const slot = calculateSlot(slotInput());
  for (const change of [
    { measurementPoints: [198, 198, 198, 198, 198] },
    { measurementPoints: [198, 198, null, 198, 198, 198] },
    { tremiePulls: [0, null] }, { tremiePulls: [0, 0, 0] },
    { jointPulls: { left: 0 } }, { jointPulls: { left: 0, right: 0, extra: 0 } }
  ]) assert.throws(() => calculateRecord(slot, { ...raw(slot), ...change }), ValidationError);
});

test('负值、越界测深、无效日期、零时长和非数字被拒绝', () => {
  const slot = calculateSlot(slotInput());
  for (const change of [
    { volume: 0 }, { volume: '15' }, { volume: 1.12345 }, { volume: Infinity },
    { measurementPoints: Array(6).fill(201) }, { measurementPoints: Array(6).fill(-1) },
    { tremiePulls: [1000001, 0] }, { jointPulls: { left: -1000001, right: 0 } },
    { startedAt: '2026-02-30T10:00' }, { endedAt: '2026-09-07T10:00' },
    { endedAt: '2026-09-07T11:99' }
  ]) assert.throws(() => calculateRecord(slot, { ...raw(slot), ...change }), ValidationError);
});

test('不存在新增高度时充盈系数为空，首车速度保留真实的 0', () => {
  const slot = calculateSlot(slotInput(1, 'none'));
  const result = calculateRecord(slot, { ...raw(slot), measurementPoints: Array(6).fill(200) });
  assert.equal(result.metrics.fillCoefficient, null);
  assert.equal(result.metrics.actualSpeed, 0);
  assert.equal(result.metrics.notes.length, 1);
});

test('非零建档面高同时作用于首车速度、理论面和新增测深折算方量', () => {
  const slot = calculateSlot({ ...slotInput(1, 'none'), initialConcreteHeight: 5 });
  const result = calculateRecord(slot, { ...raw(slot), measurementPoints: Array(6).fill(193) });
  assert.equal(slot.initialConcreteHeight, 5);
  assert.equal(slot.capacity, slot.area * slot.depth);
  assert.equal(result.metrics.actualHeight, 7);
  assert.equal(result.metrics.actualRiseFromInitial, 2);
  assert.equal(result.metrics.actualSpeed, 2);
  near(result.metrics.theoreticalDepth, 200 - 5 - 15 / slot.area);
  near(result.metrics.measurementVolume, 2 * slot.area);
  near(result.metrics.fillCoefficient, 15 / (2 * slot.area));
});

test('实测面低于建档面时保留负的原始派生值，不伪造充盈系数', () => {
  const slot = calculateSlot({ ...slotInput(1, 'none'), initialConcreteHeight: 5 });
  const result = calculateRecord(slot, { ...raw(slot), measurementPoints: Array(6).fill(196) });
  assert.equal(result.metrics.actualRiseFromInitial, -1);
  assert.equal(result.metrics.measurementVolume, -slot.area);
  assert.equal(result.metrics.actualSpeed, -1);
  assert.equal(result.metrics.fillCoefficient, null);
  assert.ok(result.metrics.notes.some(note => note.includes('保留负的新增高度')));
});

test('建档面高允许 0 且不得超过槽深，旧槽缺字段按 0 兼容', () => {
  assert.equal(calculateSlot(slotInput()).initialConcreteHeight, 0);
  for (const initialConcreteHeight of [null, -1, 200.0001, 1.12345, '0']) {
    assert.throws(() => calculateSlot({ ...slotInput(), initialConcreteHeight }), ValidationError);
  }
});

test('不对超设计容积或实测面下降的原始数据静默截断', () => {
  const slot = calculateSlot(slotInput(1, 'none'));
  const first = calculateRecord(slot, raw(slot));
  const result = calculateRecord(slot, { ...raw(slot), truckNo: 2, volume: 10000,
    endedAt: '2026-09-07T12:00', measurementPoints: Array(6).fill(199) }, { ...first.raw, metrics: first.metrics });
  assert.ok(result.metrics.theoreticalDepth < 0);
  assert.equal(result.metrics.actualSpeed, -1);
  assert.equal(result.metrics.notes.length, 2);
});

test('旧时间补录不混入顺序追加链', () => {
  const slot = calculateSlot(slotInput());
  const first = calculateRecord(slot, raw(slot));
  assert.throws(() => calculateRecord(slot, raw(slot), { ...first.raw, metrics: first.metrics }), /结束时间必须晚于前序/);
});

test('槽段缺失配置、非法截面与异常初始管长被拒绝，管深可独立超过槽深', () => {
  for (const change of [ { code: '<script>' }, { width: 0 }, { thickness: .2 },
    { tremieInitialDepths: [1000001, 200] }, { tremieCount: 4 }, { jointLayout: 'single' },
    { tremieInitialDepths: [null, 200] }, { jointInitialDepths: { left: 200 } }
  ]) assert.throws(() => calculateSlot({ ...slotInput(), ...change }), ValidationError);
  assert.deepEqual(calculateSlot({...slotInput(),depth:10}).tremieInitialDepths,[200,200]);
});

test('接头占满槽宽时拒绝生成重叠的浇筑管模型', () => {
  for (const layout of ['left', 'right', 'both']) {
    const input = slotInput(3, layout);
    const minimum = .93 * sidesFor(layout).length / 2 + 3 * .3;
    assert.throws(() => calculateSlot({ ...input, width: minimum - .1 }), /不足以容纳/);
    const valid = calculateSlot({ ...input, width: Number(minimum.toFixed(4)) });
    assert.equal(new Set(valid.model.pipes.filter(p => p.kind === 'tremie').map(p => p.x)).size, 3);
  }
});

test('接头管径默认 0.93，允许自定义且不得超过槽厚；浇筑管径固定 0.30', () => {
  near(calculateSlot(slotInput()).area, 10.8 - Math.PI * (.93 / 2) ** 2);
  const custom = calculateSlot({ ...slotInput(), jointDiameter: .8, tremieDiameter: 99 });
  near(custom.area, 10.8 - Math.PI * .4 ** 2);
  assert.equal(custom.tremieDiameter, .3);
  assert.equal(custom.model.pipes.find(p => p.kind === 'joint').diameter, .8);
  near(calculateSlot({ ...slotInput(), jointDiameter: 1.8 }).area, 10.8 - Math.PI * .9 ** 2);
  for (const d of [null, 0, -1, 1.8001, '0.93', NaN, Infinity]) {
    assert.throws(() => calculateSlot({ ...slotInput(), jointDiameter: d }), ValidationError);
  }
  assert.throws(() => calculateSlot({ ...slotInput(), thickness: .8 }), /不得超过/);
  assert.equal(calculateSlot({ ...slotInput(2, 'none'), jointDiameter: null }).area, 10.8);
});
