import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button, Empty, ErrorLine, PageTitle, usePortal } from "./Portal";
import { api, message, type User } from "./api";
import { ThemeOptions } from "./Theme";

const roleNames: Record<string, string> = {
  admin: "管理员",
  dispatcher: "调度员",
  observer: "观察员",
};
const permissionNames: Record<string, string> = {
  "workspace.read": "查看工作台",
  "task.read": "查看任务",
  "task.create": "创建与规划任务",
  "task.execute": "确认执行 / 结束测试",
  "map.read": "查看空域态势",
  "telemetry.read": "查看设备遥测",
  "report.read": "查看运行记录",
  "identity.manage": "管理成员与角色",
};

export function AccountPage() {
  const { user, refreshUser, toast, go } = usePortal();
  const [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [disabling, setDisabling] = useState(false);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YOUR IDENTITY, PROTECTED"
        title="账户与安全"
        description="管理个人身份、邮箱验证与多因素认证。"
      />
      <ErrorLine text={error} />
      <ThemeOptions />
      <section className="p-card p-profile-card">
        <span className="p-profile-avatar">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
        <span className="p-tag">{user.role_name}</span>
        <span className="p-profile-state">
          <CheckCircle2 size={16} />
          当前账户已启用
        </span>
      </section>
      <div className="p-security-grid">
        <section className="p-card p-security-card">
          <div className="p-security-head">
            <span>
              <Mail size={23} />
            </span>
            <div>
              <h2>邮箱验证</h2>
              <p>{user.email}</p>
            </div>
            <span
              className={`p-status ${user.email_verified ? "" : "warning"}`}
            >
              {user.email_verified ? "已验证" : "待验证"}
            </span>
          </div>
          {user.email_verified ? (
            <div className="p-success-note">
              <CheckCircle2 size={18} />
              邮箱已验证，你可以按角色权限使用团队功能。
            </div>
          ) : (
            <>
              <p>验证邮箱以确认账户归属。管理员在邀请成员前需要先完成验证。</p>
              <div className="p-info">
                <Mail size={18} />
                <p>
                  当前为本地交付模式，系统不会发送邮件。验证令牌写入运行电脑的{" "}
                  <code>logs/identity/outbox/</code>
                  ；使用自定义目录时以配置为准。请从本机管理员处获取对应邮箱的令牌，30分钟内有效。
                </p>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api("/auth/email/send", {});
                    toast("新验证令牌已写入本地发件箱，旧令牌失效");
                  })
                }
              >
                重新生成验证令牌
              </Button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api("/auth/email/verify", { token });
                    await refreshUser();
                    setToken("");
                    toast("邮箱验证完成");
                  });
                }}
              >
                <label className="p-field">
                  验证令牌
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="粘贴本地发件箱中的 token"
                  />
                </label>
                <Button type="submit" primary disabled={busy || !token}>
                  验证我的邮箱
                  <ArrowRight size={15} />
                </Button>
              </form>
            </>
          )}
        </section>
        <section className="p-card p-security-card">
          <div className="p-security-head">
            <span>
              <KeyRound size={23} />
            </span>
            <div>
              <h2>多因素认证（MFA）</h2>
              <p>密码 + 验证器动态口令</p>
            </div>
            <span className={`p-status ${user.mfa_enabled ? "" : "neutral"}`}>
              {user.mfa_enabled ? "已启用" : "未启用"}
            </span>
          </div>
          <p>
            使用支持 TOTP 的验证器
            App，为账户增加一层身份验证。动态口令每30秒更新，同一口令只能使用一次。
          </p>
          {user.mfa_enabled && !disabling ? (
            <>
              <div className="p-success-note">
                <ShieldCheck size={18} />
                下次登录时，需要同时提供密码和动态验证码。
              </div>
              <button
                className="p-text-button p-danger"
                onClick={() => {
                  setDisabling(true);
                  setPassword("");
                  setCode("");
                }}
              >
                关闭多因素认证
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  if (disabling) {
                    await api("/auth/mfa/disable", { password, code });
                    toast("MFA 已关闭，现有会话已撤销，请重新登录");
                    go("/login");
                  } else if (!secret) {
                    const data = await api<{ secret: string }>(
                      "/auth/mfa/setup",
                      { password },
                    );
                    setSecret(data.secret);
                    setPassword("");
                    toast("设置密钥已生成，请添加到验证器后输入动态口令");
                  } else {
                    await api("/auth/mfa/confirm", { code });
                    await refreshUser();
                    setSecret("");
                    setCode("");
                    toast("多因素认证已启用");
                  }
                });
              }}
            >
              {!secret && (
                <label className="p-field">
                  当前密码
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="验证是你本人在操作"
                  />
                </label>
              )}
              {secret && (
                <div className="p-mfa-secret">
                  <strong>在验证器中手动添加账户</strong>
                  <p>类型：基于时间（TOTP） · 6位 · 30秒 · SHA-1</p>
                  <p>账户：{user.email} · 发行方：AERIS</p>
                  <code>{secret}</code>
                  <button
                    type="button"
                    className="p-text-button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(secret)
                        .then(() => toast("设置密钥已复制"))
                        .catch(() => setError("无法自动复制，请手动选择密钥"))
                    }
                  >
                    <Copy size={14} />
                    复制设置密钥
                  </button>
                  <small>请妥善保管验证器；本地版本暂不提供自助恢复码。</small>
                </div>
              )}
              {(secret || disabling) && (
                <label className="p-field">
                  验证器动态口令
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoComplete="one-time-code"
                    placeholder="6位数字"
                  />
                </label>
              )}
              <div className="p-inline">
                <Button primary={!disabling} type="submit" disabled={busy}>
                  {disabling
                    ? "验证并关闭 MFA"
                    : secret
                      ? "确认并启用 MFA"
                      : "开始设置 MFA"}
                  <ArrowRight size={15} />
                </Button>
                {(secret || disabling) && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setSecret("");
                      setDisabling(false);
                      setCode("");
                      setPassword("");
                    }}
                  >
                    稍后设置
                  </Button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
      <section className="p-card p-spaced">
        <div className="p-card-head">
          <div>
            <h2>你的操作权限</h2>
            <p>权限由工作区管理员分配，无法在浏览器端自行提升。</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="p-permission-tags">
          {user.permissions.map((p) => (
            <span key={p}>
              <Check size={14} />
              {permissionNames[p] || p}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

function MemberRow({
  member,
  onSaved,
}: {
  member: User;
  onSaved: () => Promise<void>;
}) {
  const { toast, user, refreshUser } = usePortal();
  const [role, setRole] = useState(member.role),
    [active, setActive] = useState(member.active),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setRole(member.role);
    setActive(member.active);
  }, [member]);
  return (
    <div className="p-member-row">
      <div className="p-member-person">
        <span>{member.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>
            {member.name}
            {member.id === user.id && <small>你</small>}
          </strong>
          <p>{member.email}</p>
        </div>
      </div>
      <span className="p-member-verified">
        {member.email_verified ? (
          <>
            <CheckCircle2 size={14} />
            已验证
          </>
        ) : (
          "待验证"
        )}
      </span>
      <select
        aria-label={`${member.name}的角色`}
        value={role}
        disabled={busy}
        onChange={(e) => setRole(e.target.value)}
      >
        {Object.entries(roleNames).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <label className="p-member-toggle">
        <input
          type="checkbox"
          checked={active}
          disabled={busy}
          onChange={(e) => setActive(e.target.checked)}
        />
        启用
      </label>
      <Button
        disabled={busy || (role === member.role && active === member.active)}
        onClick={() => {
          setBusy(true);
          setError("");
          void api("/auth/users/" + member.id, { role, active }, "PATCH")
            .then(async () => {
              toast("成员权限已更新，其现有会话已撤销");
              await onSaved();
              if (member.id === user.id) await refreshUser();
            })
            .catch((e) => setError(message(e)))
            .finally(() => setBusy(false));
        }}
      >
        保存变更
      </Button>
      {error && <ErrorLine text={error} />}
    </div>
  );
}

export function IdentityPage({ rolesOnly }: { rolesOnly: boolean }) {
  const { toast, go, user } = usePortal();
  const [users, setUsers] = useState<User[]>([]),
    [roles, setRoles] = useState<
      { id: string; name: string; permissions: string[] }[]
    >([]),
    [events, setEvents] = useState<
      {
        id: number;
        at: number;
        actor: string;
        action: string;
        detail: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [inviting, setInviting] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("observer"),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [u, r, e] = await Promise.all([
        api<User[]>("/auth/users"),
        api<typeof roles>("/auth/roles"),
        api<typeof events>("/auth/events"),
      ]);
      setUsers(u);
      setRoles(r);
      setEvents(e);
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <PageTitle
        eyebrow="IDENTITY & ACCESS"
        title={rolesOnly ? "角色与权限" : "团队成员"}
        description={
          rolesOnly
            ? "每个角色都有清晰的操作边界，前端与接口保持一致。"
            : "邀请伙伴加入工作区，按职责分配访问权限。"
        }
        action={
          !rolesOnly && (
            <Button primary onClick={() => setInviting(!inviting)}>
              <Plus size={17} />
              邀请成员
            </Button>
          )
        }
      />
      <ErrorLine text={error} />
      {inviting && (
        <section className="p-card p-invite-form">
          <div className="p-card-head">
            <div>
              <h2>邀请新的团队成员</h2>
              <p>邀请码绑定目标邮箱，有效期48小时，仅可使用一次。</p>
            </div>
            <Users size={22} />
          </div>
          {!user.email_verified && (
            <div className="p-info warning">
              <Mail size={18} />
              <p>邀请前，请先完成管理员邮箱验证。</p>
              <button onClick={() => go("/account")}>
                验证邮箱
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              void api("/auth/invitations", { email, role })
                .then(() => {
                  toast("邀请已创建，邀请码写入本地身份服务发件箱");
                  setEmail("");
                })
                .catch((e) => setError(message(e)))
                .finally(() => setBusy(false));
            }}
          >
            <label className="p-field">
              成员邮箱
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </label>
            <label className="p-field">
              分配角色
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(roleNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              primary
              type="submit"
              disabled={busy || !user.email_verified}
            >
              创建邀请
              <ArrowRight size={15} />
            </Button>
          </form>
          <p className="p-input-hint">
            当前没有配置邮件服务。管理员从本机
            logs/identity/outbox（或配置目录）获取邀请码，交给对应成员在注册页面填写。系统不会自动发邮件。
          </p>
        </section>
      )}
      {rolesOnly ? (
        <section className="p-card">
          <div className="p-card-head">
            <h2>内置角色权限</h2>
            <span className="p-tag">服务端强制校验</span>
          </div>
          <div className="p-role-table">
            <table>
              <thead>
                <tr>
                  <th>操作权限</th>
                  {roles.map((r) => (
                    <th key={r.id}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(permissionNames).map(([key, name]) => (
                  <tr key={key}>
                    <td>{name}</td>
                    {roles.map((r) => (
                      <td key={r.id}>
                        {r.permissions.includes(key) ? (
                          <Check size={17} aria-label="允许" />
                        ) : (
                          <span aria-label="无权限">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="p-table-note">
            当前使用内置角色。导航与按钮按权限显示；直接调用接口同样受权限限制。至少保留一名启用的管理员。
          </p>
        </section>
      ) : (
        <>
          <section className="p-card">
            <div className="p-card-head">
              <div>
                <h2>
                  工作区成员 <span className="p-tag">{users.length}</span>
                </h2>
                <p>权限变更会撤销该成员的现有登录会话。</p>
              </div>
              <Button onClick={() => void load()}>
                <RefreshCw size={15} />
                刷新
              </Button>
            </div>
            {users.map((member) => (
              <MemberRow key={member.id} member={member} onSaved={load} />
            ))}
          </section>
          <section className="p-card p-spaced">
            <div className="p-card-head">
              <h2>身份操作记录</h2>
              <ShieldCheck size={19} />
            </div>
            {events.length ? (
              <div className="p-identity-events">
                {events.slice(0, 15).map((e) => (
                  <div key={e.id}>
                    <time>{new Date(e.at * 1000).toLocaleString("zh-CN")}</time>
                    <strong>{e.actor || "系统"}</strong>
                    <span>
                      {(
                        {
                          workspace_initialized: "初始化工作区",
                          user_registered: "成员注册",
                          email_verified: "邮箱验证",
                          login: "登录",
                          member_invited: "邀请成员",
                          member_updated: "修改成员权限",
                          mfa_enabled: "开启MFA",
                          mfa_disabled: "关闭MFA",
                        } as Record<string, string>
                      )[e.action] || e.action}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="尚无身份操作记录" />
            )}
          </section>
        </>
      )}
    </>
  );
}
