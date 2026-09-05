import { describe, it, expect } from 'vitest';
import { aoi } from './helpers/aoi.js';

describe('Aoi.calc 汇率换算', () => {
  it('roundHalf 按 0.5 圆整规则处理小数部分', () => {
    expect(aoi.calc.roundHalf(10.3)).toBe(10);   // ≤0.3 → 舍
    expect(aoi.calc.roundHalf(10.4)).toBe(10.5); // 0.4~0.6 → 0.5
    expect(aoi.calc.roundHalf(10.6)).toBe(10.5);
    expect(aoi.calc.roundHalf(10.7)).toBe(11);   // ≥0.7 → 进
  });

  it('convert = 外币 × (汇率 + 加价) 后 0.5 圆整', () => {
    // 100 × (0.048 + 0.005) = 5.3，小数 0.3 → 5
    expect(aoi.calc.convert(100, 0.048, 0.005)).toBe(5);
    expect(aoi.calc.convert(200, 0.048, 0.005)).toBe(10.5); // 10.6 → 10.5
  });

  it('toRmb 对人民币原样返回', () => {
    aoi.state.data = { calc: {} };
    expect(aoi.calc.toRmb(88.8, 'cny')).toBe(88.8);
    expect(aoi.calc.toRmb(88.8, null)).toBe(88.8);
  });

  it('toRmb 对外币使用 state.calc 配置（缺省回退默认汇率）', () => {
    aoi.state.data = { calc: { jpyRate: 0.05, jpyMarkup: 0.01 } };
    // 100 × 0.06 = 6
    expect(aoi.calc.toRmb(100, 'jpy')).toBe(6);
    aoi.state.data = {}; // 未配置 → 默认 jpy 0.048+0.005=0.053
    expect(aoi.calc.toRmb(100, 'jpy')).toBe(5);
  });
});
