import { describe, it, expect, beforeEach } from 'vitest';
import { aoi } from './helpers/aoi.js';

// 预置：一个批次、两种制品的订单（合成数据）
function seed() {
  aoi.state.data = {
    orders: [
      { id: 'o1', type: '色纸', model: 'A', count: 2, buyer: '小樱', batchId: 'b1' },
      { id: 'o2', type: '色纸', model: 'A', count: 1, buyer: '小狼', batchId: 'b1' },
      { id: 'o3', type: '亚克力', model: 'B', count: 3, buyer: '小樱', batchId: 'b1' },
      { id: 'o4', type: '亚克力', model: 'B', count: 1, buyer: '小狼', batchId: 'b2' } // 不在 b1
    ],
    batches: [{ id: 'b1', date: '2026-09-01', targetAmount: 100, weights: { '色纸|A': 1, '亚克力|B': 2 } }]
  };
}

describe('Aoi.intl 国际运费分摊', () => {
  beforeEach(seed);

  it('itemsForBatch 按制品类型|型号去重并累加数量', () => {
    const items = aoi.intl.itemsForBatch('b1');
    expect(items).toHaveLength(2);
    const a = items.find((i) => i.type === '色纸');
    const b = items.find((i) => i.type === '亚克力');
    expect(a.quantity).toBe(3);
    expect(b.quantity).toBe(3);
  });

  it('recalc：单位国际费 = (总额/总重) × 单位重', () => {
    const items = aoi.intl.buildItems(aoi.intl.getBatch('b1'));
    // 总重 = 3×1 + 3×2 = 9，单价：色纸 100/9×1，亚克力 100/9×2
    const se = items.find((i) => i.type === '色纸');
    const ya = items.find((i) => i.type === '亚克力');
    expect(se.avgIntlFee).toBeCloseTo(100 / 9, 6);
    expect(ya.avgIntlFee).toBeCloseTo(200 / 9, 6);
  });

  it('manualFees 手动覆盖加权单价', () => {
    const d = aoi.state.data;
    d.batches[0].manualFees = { '色纸|A': 15 };
    const items = aoi.intl.buildItems(d.batches[0]);
    const se = items.find((i) => i.type === '色纸');
    expect(se.manual).toBe(true);
    expect(se.weightedIntlFee).toBe(15);
    expect(se.weightedTotalFee).toBe(45);
  });

  it('buyerTotals 按买家累加且只统计本批次', () => {
    const items = aoi.intl.buildItems(aoi.intl.getBatch('b1'));
    const totals = aoi.intl.buyerTotals('b1', items);
    // 小樱：色纸×2 + 亚克力×3 = 2×(100/9) + 3×(200/9) = 800/9
    expect(totals['小樱']).toBeCloseTo(800 / 9, 6);
    // 小狼只有 b1 的色纸×1
    expect(totals['小狼']).toBeCloseTo(100 / 9, 6);
  });

  it('targetAmount 为 0 时单价为 0（不产生 NaN）', () => {
    const d = aoi.state.data;
    d.batches[0].targetAmount = 0;
    const items = aoi.intl.buildItems(d.batches[0]);
    items.forEach((it) => expect(it.avgIntlFee).toBe(0));
  });
});
