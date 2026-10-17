import type { Fighter, FighterDef } from "../types";
import { damageUnitsNear, spawnZone } from "../units";
import { hitAround, skill, steerToward, ticks } from "./kit";

/** One cut of the whirl. */
const HATTIN = { heal: 150 };
const CUT = { damage: 42, knockback: 160 };
const ABILITY = { name: "SCIMITAR WHIRL", text: "Spins his blades, cutting all around him" };

/** Per-fighter whirl clock and reach (two Saladins can meet). */
const whirls = new WeakMap<Fighter, { t: number; reach: number }>();

export const saladin: FighterDef = {
  id: "saladin",
  name: "SALADIN",
  description:
    "Selahaddin Eyyubi. Belli aralıklarla palalarını savurarak döner; dönerken yanına gelen herkese art arda pala darbesi vurur. Seviye atladıkça dönüş uzar ve menzili büyür. Ultimate'ta (Hattin) rakibin çevresinde alev halkası yakar ve 150 can yeniler.",
  era: "1137–1193",
  fact: "Retook Jerusalem in 1187; even his crusader enemies praised his chivalry.",
  fullName: "Saladin (Salah ad-Din)",
  sources: ["https://en.wikipedia.org/wiki/Saladin"],
  musicMode: "hijaz",
  title: "Sultan of Egypt and Syria",
  flag: "ayyubid",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "WHIRL DMG", base: 42 },
  hp: 1000,
  radius: 56,
  mass: 1.05,
  baseSpeed: 480,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 130,
  hitInterval: 0.5,
  contactDamage: 58,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.6,
    cooldown: 3.2,
    active: (level) => 0.9 + 0.3 * (level - 1),
    cast(_world, self, level) {
      const reach = self.radius + 50 + 12 * (level - 1);
      self.whirl = reach;
      self.speedMul = 1.2;
      whirls.set(self, { t: 0, reach });
    },
    whileActive(world, self, dt) {
      const w = whirls.get(self);
      if (!w) return;
      w.t += dt;
      steerToward(world, self, 2 * dt);
      if (ticks(w.t, dt, 0.2) === 0) return;
      hitAround(world, self, self.x, self.y, w.reach, CUT.damage, CUT.knockback);
      // Soldiers are cut less badly than a leader in the middle of the whirl.
      damageUnitsNear(world, self, self.x, self.y, w.reach, CUT.damage * 0.5);
    },
    onEnd(_world, self) {
      self.whirl = 0;
      self.speedMul = 1;
    },
    ultimate: {
      name: "HORNS OF HATTIN",
      cast(world, self) {
        world.heal(self, HATTIN.heal);
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // The dry grass around the enemy goes up in flames, as at Hattin.
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          spawnZone(world, self, {
            style: "fire",
            x: enemy.x + Math.cos(a) * 130,
            y: enemy.y + Math.sin(a) * 130,
            radius: 55,
            ttl: 3,
            damage: 80,
            poison: 0,
            poisonDps: 0,
          });
        }
      },
    },
  }),
};
