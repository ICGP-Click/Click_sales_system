import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aoi } from './helpers/aoi.js';

const NOTIFICATIONS = [
  { id: 'n1', type: 'remind', buyer: '小樱', body: '小樱：请缴费', sent: false },
  { id: 'n2', type: 'remind', buyer: '小狼', body: '小狼：请缴费', sent: false },
  { id: 'n3', type: 'remind', buyer: '无绑定', body: '无绑定：请缴费', sent: false }
];

function setup(stubs) {
  aoi.state.data = { orders: [], notifications: JSON.parse(JSON.stringify(NOTIFICATIONS)) };
  aoi.saveTeamData = async (d) => { aoi.state.data = d; };
  aoi.bot.pushPrivate = vi.fn(stubs.private);
  aoi.bot.pushAll = vi.fn(stubs.group);
}

describe('Aoi.notify.pushBot 双通道模式（all = 私聊尽力 + 群@全员兜底）', () => {
  beforeEach(() => {
    aoi.state.user = { id: 'boss', username: 'boss', role: 'super' };
  });

  it('默认（无参）即 all：私聊逐人尝试，群发覆盖所有人，全部标记已发送', async () => {
    setup({
      private: vi.fn().mockResolvedValue({ sent: 2, failed: 0, sentIds: ['n1', 'n2'], unbound: ['无绑定'] }),
      group: vi.fn().mockResolvedValue({ status: 200 })
    });
    await aoi.notify.pushBot(); // 不传 mode，走默认
    expect(aoi.bot.pushPrivate).toHaveBeenCalledTimes(1);
    expect(aoi.bot.pushAll).toHaveBeenCalledTimes(1);
    // 群发名单 = 全部未发（含已私聊成功的 n1/n2 和未绑定的 n3）
    const grouped = aoi.bot.pushAll.mock.calls[0][0].map(n => n.id);
    expect(grouped).toEqual(['n1', 'n2', 'n3']);
    expect(aoi.state.data.notifications.every(n => n.sent)).toBe(true);
  });

  it('私聊部分失败也照样群发兜底，全部标记已发送', async () => {
    setup({
      private: vi.fn().mockResolvedValue({ sent: 1, failed: 1, sentIds: ['n1'], unbound: ['无绑定'] }),
      group: vi.fn().mockResolvedValue({ status: 200 })
    });
    await aoi.notify.pushBot('all');
    expect(aoi.bot.pushAll).toHaveBeenCalledTimes(1);
    expect(aoi.state.data.notifications.every(n => n.sent)).toBe(true);
  });

  it('私聊通道整体异常（非登录态）时降级为纯群发，推送不失败', async () => {
    setup({
      private: vi.fn().mockRejectedValue(new Error('推送失败（502）')),
      group: vi.fn().mockResolvedValue({ status: 200 })
    });
    await aoi.notify.pushBot('all');
    expect(aoi.bot.pushAll).toHaveBeenCalledTimes(1);
    expect(aoi.state.data.notifications.every(n => n.sent)).toBe(true);
  });

  it('登录态失效（401）时整体中止：群发也不发，不标记已发送', async () => {
    setup({
      private: vi.fn().mockRejectedValue(new Error('推送失败（401）：管理员会话已失效')),
      group: vi.fn().mockResolvedValue({ status: 200 })
    });
    await aoi.notify.pushBot('all');
    expect(aoi.bot.pushAll).not.toHaveBeenCalled();
    expect(aoi.state.data.notifications.every(n => !n.sent)).toBe(true);
  });

  it('private 模式仅私聊，未绑定的保持未发', async () => {
    setup({
      private: vi.fn().mockResolvedValue({ sent: 2, failed: 0, sentIds: ['n1', 'n2'], unbound: ['无绑定'] }),
      group: vi.fn()
    });
    await aoi.notify.pushBot('private');
    expect(aoi.bot.pushAll).not.toHaveBeenCalled();
    const sent = aoi.state.data.notifications.filter(n => n.sent).map(n => n.id);
    expect(sent).toEqual(['n1', 'n2']);
  });

  it('group 模式仅群发，全部标记已发送', async () => {
    setup({
      private: vi.fn(),
      group: vi.fn().mockResolvedValue({ status: 200 })
    });
    await aoi.notify.pushBot('group');
    expect(aoi.bot.pushPrivate).not.toHaveBeenCalled();
    expect(aoi.state.data.notifications.every(n => n.sent)).toBe(true);
  });
});
