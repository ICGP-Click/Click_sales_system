import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aoi, win } from './helpers/aoi.js';

function enableBot() {
  aoi.state.data = {
    orders: [],
    memberMeta: { '小樱': { qq: '111' }, '小狼': { qq: '222' } }
  };
  aoi.bot.config.enabled = true;
  aoi.bot.config.relay = 'https://relay.example.com';
  aoi.bot.config.groupId = '999';
}

// 原始实现引用：下方 describe 会把 sendPrivate/sendGroup 换成桩，之后需要恢复
const realSendPrivate = aoi.bot.sendPrivate;
const realSendGroup = aoi.bot.sendGroup;

describe('Aoi.bot 私聊推送链路（v1.7.0 补上 sendPrivate 无调用方的缺口）', () => {
  beforeEach(() => {
    enableBot();
    // stub 私聊/群发底层：记调用，默认成功
    aoi.bot.sendPrivate = vi.fn().mockResolvedValue({ status: 200 });
    aoi.bot.sendGroup = vi.fn().mockResolvedValue({ status: 200 });
  });

  const notifications = [
    { id: 'n1', buyer: '小樱', body: '小樱：请缴纳国际费 ¥12.5' },
    { id: 'n2', buyer: '小狼', body: '小狼：请缴纳国际费 ¥8' },
    { id: 'n3', buyer: '无绑定', body: '无绑定：请缴纳国际费 ¥3' }
  ];

  it('pushPrivate 对已绑定 QQ 的逐人私聊，未绑定的归入 unbound', async () => {
    const r = await aoi.bot.pushPrivate(notifications);
    expect(aoi.bot.sendPrivate).toHaveBeenCalledTimes(2);
    expect(aoi.bot.sendPrivate).toHaveBeenCalledWith('111', '小樱：请缴纳国际费 ¥12.5');
    expect(aoi.bot.sendPrivate).toHaveBeenCalledWith('222', '小狼：请缴纳国际费 ¥8');
    expect(r.sent).toBe(2);
    expect(r.sentIds).toEqual(['n1', 'n2']);
    expect(r.unbound).toEqual(['无绑定']);
  });

  it('pushPrivate 私聊失败计入 failed 且不中断后续', async () => {
    aoi.bot.sendPrivate = vi.fn()
      .mockRejectedValueOnce(new Error('推送失败（502）'))
      .mockResolvedValueOnce({ status: 200 });
    const r = await aoi.bot.pushPrivate(notifications);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.sentIds).toEqual(['n2']);
  });

  it('pushAll 群发消息按 buyer→qq 生成 CQ:at，不依赖 body 前缀', async () => {
    await aoi.bot.pushAll([
      { id: 'n1', buyer: '小樱', body: '任意格式正文' },
      { id: 'n3', buyer: '无绑定', body: '无绑定正文' }
    ]);
    expect(aoi.bot.sendGroup).toHaveBeenCalledTimes(1);
    const msg = aoi.bot.sendGroup.mock.calls[0][0];
    expect(msg).toContain('[CQ:at,qq=111] 任意格式正文');
    expect(msg).toContain('无绑定正文'); // 未绑定的保持纯文本
    expect(msg).not.toContain('[CQ:at,qq=null]');
  });
});

describe('Aoi.bot 请求鉴权与错误处理（v3 修复：debug 拦截 + 401 引导）', () => {
  const SESSION = { token: 't'.repeat(64), role: 'super', username: 'boss', expiresAt: '2099-01-01T00:00:00Z' };

  beforeEach(() => {
    win.localStorage.clear();
    delete win.fetch;
    aoi.bot.sendPrivate = realSendPrivate;
    aoi.bot.sendGroup = realSendGroup;
    aoi.adminClearSession();
    aoi.state.user = { id: 'boss', username: 'boss', role: 'super' };
    aoi.state.data = { orders: [], memberMeta: {} };
    aoi.bot.config.enabled = true;
    aoi.bot.config.relay = 'https://relay.example.com';
    aoi.bot.config.groupId = '999';
  });

  it('debug 账号直接拦截并给出明确提示（无管理员会话，relay 必然 401）', async () => {
    aoi.state.user = { id: 'debug-local', username: 'debug', isDebug: true };
    await expect(aoi.bot.pushAll([{ id: 'n1', buyer: '小樱', body: 'x' }])).rejects.toThrow(/debug 账号/);
  });

  it('无管理员会话时提示重新登录，而不是发空 token 撞 401', async () => {
    await expect(aoi.bot.pushAll([{ id: 'n1', buyer: '小樱', body: 'x' }])).rejects.toThrow(/登录态缺失/);
  });

  it('relay 返回 401 时转为可操作的引导信息', async () => {
    aoi.adminSaveSession(SESSION);
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"error":"unauthorized"}' });
    await expect(aoi.bot.pushAll([{ id: 'n1', buyer: '小樱', body: 'x' }])).rejects.toThrow(/（401）.*重新登录/);
  });

  it('pushPrivate 遇登录态失效立即中止（不顶着坏会话打满队列）', async () => {
    aoi.adminSaveSession(SESSION);
    aoi.state.data.memberMeta = { '小樱': { qq: '111' }, '小狼': { qq: '222' } };
    aoi.bot.sendPrivate = vi.fn().mockRejectedValue(new Error('推送失败（401）：管理员会话已失效'));
    await expect(aoi.bot.pushPrivate([
      { id: 'n1', buyer: '小樱', body: 'a' },
      { id: 'n2', buyer: '小狼', body: 'b' }
    ])).rejects.toThrow(/401/);
    expect(aoi.bot.sendPrivate).toHaveBeenCalledTimes(1);
  });

  it('isAuthError 识别 relay 原始 unauthorized 与包装后的 401', () => {
    expect(aoi.bot.isAuthError(new Error('推送失败（401）：x'))).toBe(true);
    expect(aoi.bot.isAuthError(new Error('unauthorized'))).toBe(true);
    expect(aoi.bot.isAuthError(new Error('推送失败（502）'))).toBe(false);
  });
});

describe('Aoi.member 保存助手与掩码回执', () => {
  beforeEach(() => {
    win.localStorage.clear();
    aoi.member.state = { key: 'k1', cn: '小樱', teamName: '测试团', updatedAt: 'v1' };
  });

  it('mask：长内容留首尾各 2 字，短内容全遮', () => {
    expect(aoi.member.mask('上海市浦东新区某路123号')).toBe('上海****3号');
    expect(aoi.member.mask('123')).toBe('***');
    expect(aoi.member.mask('')).toBe('***');
  });

  it('persist：携带当前乐观锁版本保存，成功后更新为新版本', async () => {
    const calls = [];
    aoi.saveTeamDataByMemberKey = async (key, data, expected) => {
      calls.push({ key, data, expected });
      return 'v2';
    };
    await aoi.member.persist({ addresses: { '小樱': '某地址' } });
    expect(calls[0].expected).toBe('v1');
    expect(aoi.member.state.updatedAt).toBe('v2');
  });

  it('persist：版本冲突时清空本地版本并抛错（下次重试不再带旧锁）', async () => {
    aoi.saveTeamDataByMemberKey = async () => { throw new Error('数据已被他人修改，请刷新页面重新进入后重试'); };
    await expect(aoi.member.persist({})).rejects.toThrow(/已被他人修改/);
    expect(aoi.member.state.updatedAt).toBeNull();
  });
});
