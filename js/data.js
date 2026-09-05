// Aoi-system — 数据层：团队 / 成员 / 业务数据读写（Supabase + 调试 localStorage）
window.Aoi = window.Aoi || {};

// 调试模式：团队存 localStorage（aoi_debug_ 前缀）
Aoi.debugTeam = function () {
  var key = 'aoi_debug_team';
  var team = JSON.parse(localStorage.getItem(key) || 'null');
  if (!team) {
    team = { id: 'debug-team', owner_id: 'debug-local', name: '调试团', invite_code: 'DEBUG', member_key: 'DEMO', created_at: null };
    localStorage.setItem(key, JSON.stringify(team));
  }
  // 兼容旧调试数据：补齐 member_key
  if (!team.member_key) {
    team.member_key = 'DEMO';
    localStorage.setItem(key, JSON.stringify(team));
  }
  return team;
};

// 加载当前用户的团队、角色、成员列表；无团队时返回 null
Aoi.loadTeam = async function () {
  if (Aoi.state.user && Aoi.state.user.isDebug) {
    var t = Aoi.debugTeam();
    return { team: t, role: 'owner', members: [{ user_id: 'debug-local', role: 'owner', email: Aoi.DEBUG_EMAIL }] };
  }

  var uid = Aoi.state.user.id;
  var r1 = await Aoi.db.from('team_members').select('team_id, role').eq('user_id', uid);
  if (r1.error) throw new Error(r1.error.message);
  if (!r1.data || r1.data.length === 0) return null;

  var teamId = r1.data[0].team_id;
  var role = r1.data[0].role;

  var r2 = await Aoi.db.from('teams').select('*').eq('id', teamId).single();
  if (r2.error) throw new Error(r2.error.message);

  var r3 = await Aoi.db.from('team_members').select('user_id, role, email').eq('team_id', teamId);

  return { team: r2.data, role: role, members: r3.data || [] };
};

// 读取团队业务数据 blob（订单/周边/活动等）
Aoi.getTeamData = async function () {
  if (Aoi.state.user && Aoi.state.user.isDebug) {
    return JSON.parse(localStorage.getItem('aoi_debug_data') || '{}');
  }
  var r = await Aoi.db.from('team_data').select('data').eq('team_id', Aoi.state.team.id).single();
  return (r.data && r.data.data) || {};
};

// 保存团队业务数据 blob
Aoi.saveTeamData = async function (data) {
  if (Aoi.state.user && Aoi.state.user.isDebug) {
    localStorage.setItem('aoi_debug_data', JSON.stringify(data));
    return;
  }
  await Aoi.db.from('team_data').upsert({
    team_id: Aoi.state.team.id,
    data: data,
    updated_at: new Date().toISOString()
  });
};

// 创建我的团（团长）；已属于某团队则返回该团队
Aoi.createMyTeam = async function (name) {
  if (Aoi.state.user && Aoi.state.user.isDebug) { Aoi.debugTeam(); return 'debug-team'; }
  var r = await Aoi.db.rpc('create_my_team', { team_name: name || '我的团' });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// 团长修改团名（RLS teams_update_owner 已放行 owner 更新，无需新增 RPC）
Aoi.renameTeam = async function (name) {
  if (Aoi.state.user && Aoi.state.user.isDebug) {
    var t = Aoi.debugTeam();
    t.name = name;
    localStorage.setItem('aoi_debug_team', JSON.stringify(t));
    Aoi.state.team = t;
    return;
  }
  var r = await Aoi.db.from('teams').update({ name: name }).eq('id', Aoi.state.team.id);
  if (r.error) throw new Error(r.error.message);
};

// 通过邀请码加入团队（管理员）
Aoi.joinTeamByCode = async function (code) {
  if (Aoi.state.user && Aoi.state.user.isDebug) throw new Error('调试模式不支持加入团队');
  var r = await Aoi.db.rpc('join_team_by_code', { code: code });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// 团长重新生成邀请码
Aoi.regenerateInviteCode = async function () {
  if (Aoi.state.user && Aoi.state.user.isDebug) return 'DEBUG';
  var r = await Aoi.db.rpc('regenerate_invite_code');
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// 团长移除管理员
Aoi.removeMember = async function (userId) {
  if (Aoi.state.user && Aoi.state.user.isDebug) throw new Error('调试模式不支持移除成员');
  var r = await Aoi.db.from('team_members').delete()
    .eq('user_id', userId)
    .eq('team_id', Aoi.state.team.id);
  if (r.error) throw new Error(r.error.message);
};

// 团长重新生成团员密钥（团员端免登录口令）
Aoi.regenerateMemberKey = async function () {
  if (Aoi.state.user && Aoi.state.user.isDebug) {
    var t = Aoi.debugTeam();
    t.member_key = 'DEMO' + Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem('aoi_debug_team', JSON.stringify(t));
    Aoi.state.team = t;
    return t.member_key;
  }
  var r = await Aoi.db.rpc('regenerate_member_key');
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// RPC 错误分类：把 PostgREST 报错翻译成可操作的中文提示（团员端排障的关键，
// 此前所有失败都被吞成"密钥无效"导致无法定位）
Aoi.explainRpcError = function (msg, context) {
  msg = msg || '';
  if (/Could not find the function|schema cache|function .* does not exist/i.test(msg)) {
    return '服务端缺少' + context + '接口（RPC 不存在）——请在 Supabase SQL Editor 重跑 supabase-schema.sql 后重试';
  }
  if (/已被他人修改/.test(msg)) {
    return '数据已被他人修改，请刷新页面重新进入后重试';
  }
  if (/密钥无效/.test(msg)) {
    return '团员密钥无效，请向团长确认后重新输入';
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return '网络连接失败，请检查网络后重试';
  }
  return null;
};

// 团员端：按团员密钥读取团队数据（debug 走 localStorage，否则匿名 RPC）
// 返回 { name, data, updatedAt }；updatedAt 供下次写入做乐观锁版本。
// 抛错（含分类提示），不再吞错误——密钥不匹配才返回 null。
Aoi.getTeamDataByMemberKey = async function (key) {
  var debugTeam = JSON.parse(localStorage.getItem('aoi_debug_team') || 'null');
  if (debugTeam && (debugTeam.member_key || 'DEMO') === key) {
    return {
      name: debugTeam.name || '调试团',
      data: JSON.parse(localStorage.getItem('aoi_debug_data') || '{}'),
      updatedAt: null
    };
  }
  var r = await Aoi.db.rpc('get_team_by_member_key', { member_key: key });
  if (r.error) {
    var hint = Aoi.explainRpcError(r.error.message, '团员端读取');
    throw new Error(hint || ('读取团队数据失败：' + r.error.message));
  }
  if (!r.data) return null; // 密钥不匹配（或该团队 member_key 为空）
  return r.data;
};

// 团员端：按团员密钥保存团队数据（expectedUpdatedAt 为上次读到的数据版本，乐观锁）
// 成功返回写入后的 updated_at（下次写入的版本号）
Aoi.saveTeamDataByMemberKey = async function (key, data, expectedUpdatedAt) {
  var debugTeam = JSON.parse(localStorage.getItem('aoi_debug_team') || 'null');
  if (debugTeam && (debugTeam.member_key || 'DEMO') === key) {
    localStorage.setItem('aoi_debug_data', JSON.stringify(data));
    return null;
  }
  var params = { member_key: key, new_data: data };
  if (expectedUpdatedAt) params.expected_updated_at = expectedUpdatedAt;
  var r = await Aoi.db.rpc('update_team_data_by_member_key', params);
  if (r.error) {
    var hint = Aoi.explainRpcError(r.error.message, '团员端写入');
    throw new Error(hint || ('保存失败：' + r.error.message));
  }
  return r.data;
};
