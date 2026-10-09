import { ARENA } from "../world";
import type { Ability, Fighter, FighterDef, HookHazard } from "../types";

const COOLDOWN = 2.6;
const HOOK_SPEED = 1500;
const HOOK_LIFETIME = 1.5;
const MAX_BOUNCES = 3;
const ATTACH_DAMAGE = 11;
const PULL_SPEED = 950;
const PULL_TIME = 0.6;

export const grapple: FighterDef = {
  id: "grapple",
  name: "GRAPPLE",
  description:
    "Duvarlardan seken bir kanca fırlatır. Kanca rakibe değerse onu kendine çeker ve hemen vurur.",
  hp: 100,
  radius: 44,
  mass: 1,
  baseSpeed: 500,
  spin: 6.8,
  reach: 72,
  thickness: 22,
  damage: 7,
  knockback: 300,
  hitInterval: 0.35,
  createAbility: () => {
    let phase: "cooldown" | "flying" | "pulling" = "cooldown";
    let timer = 1.4;
    let pullTime = 0;
    let hook: HookHazard | null = null;
    let target: Fighter | null = null;

    const ability: Ability = {
      onTick(world, self, dt) {
        const endHook = () => {
          if (hook) world.removeHazard(hook);
          hook = null;
          target = null;
          phase = "cooldown";
          timer = COOLDOWN;
        };

        if (phase === "cooldown") {
          timer -= dt;
          if (timer > 0) return;
          const enemy = world.nearestEnemy(self);
          if (!enemy) return;
          const aim = Math.atan2(enemy.y - self.y, enemy.x - self.x) + world.rng.range(-0.2, 0.2);
          hook = {
            kind: "hook",
            owner: self.index,
            x: self.x,
            y: self.y,
            vx: Math.cos(aim) * HOOK_SPEED,
            vy: Math.sin(aim) * HOOK_SPEED,
            bounces: 0,
            ttl: HOOK_LIFETIME,
            attached: -1,
          };
          world.hazards.push(hook);
          phase = "flying";
          world.emit({ type: "hookLaunch", fighter: self.index });
          return;
        }

        const h = hook;
        if (!h) {
          endHook();
          return;
        }

        if (phase === "flying") {
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          h.ttl -= dt;
          if (h.x < 0) {
            h.x = 0;
            h.vx = -h.vx;
            h.bounces++;
          } else if (h.x > ARENA) {
            h.x = ARENA;
            h.vx = -h.vx;
            h.bounces++;
          }
          if (h.y < 0) {
            h.y = 0;
            h.vy = -h.vy;
            h.bounces++;
          } else if (h.y > ARENA) {
            h.y = ARENA;
            h.vy = -h.vy;
            h.bounces++;
          }

          for (const t of world.fighters) {
            if (!t.alive || t.side === self.side) continue;
            if (Math.hypot(t.x - h.x, t.y - h.y) > t.radius + 10) continue;
            phase = "pulling";
            pullTime = PULL_TIME;
            target = t;
            h.attached = t.index;
            world.dealDamage(self, t, ATTACH_DAMAGE, h.x, h.y, 0);
            world.emit({ type: "hookAttach", fighter: self.index, x: h.x, y: h.y });
            return;
          }
          if (h.bounces > MAX_BOUNCES || h.ttl <= 0) endHook();
          return;
        }

        // pulling
        const t = target;
        if (!t || !t.alive) {
          endHook();
          return;
        }
        pullTime -= dt;
        h.x = t.x;
        h.y = t.y;
        const dx = self.x - t.x;
        const dy = self.y - t.y;
        const d = Math.hypot(dx, dy) || 1;
        t.vx = (dx / d) * PULL_SPEED;
        t.vy = (dy / d) * PULL_SPEED;
        if (d - self.radius - t.radius <= 12 || pullTime <= 0) {
          // Let the weapon land a hit right away.
          self.hitLock[t.index] = 0;
          endHook();
        }
      },
      hud: () =>
        phase === "cooldown"
          ? `[COOLDOWN ${Math.max(0, timer).toFixed(1)}s]`
          : phase === "flying"
            ? "[HOOK FLYING]"
            : "[RETRACTING]",
    };
    return ability;
  },
};
