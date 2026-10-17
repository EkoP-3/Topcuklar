import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { damageUnitsNear, spawnSweep } from "../units";
import { hitAround, skill, ticks } from "./kit";

/** The war cry. */
const CRY = { damage: 65, knockback: 520 };
const ABILITY = { name: "LIONHEART", text: "War cry knockback; hits harder as HP drops" };

export const richard: FighterDef = {
  id: "richard",
  name: "RICHARD I",
  description:
    "Aslan Yürekli Richard. Belli aralıklarla savaş narası atar: çevresindekileri geri iter ve hasar verir. Canı azaldıkça daha sert vurur (canı bitmeye yakınken iki kat). Ultimate'ta haçlı şövalyeleri arenayı iki dalga hâlinde geçer.",
  era: "1157–1199",
  fact: "Led the Third Crusade and beat Saladin's army at Arsuf in 1191.",
  fullName: "Richard I the Lionheart",
  sources: ["https://en.wikipedia.org/wiki/Richard_I_of_England"],
  musicMode: "mixolydian",
  title: "King of England",
  flag: "england",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "WAR CRY DMG", base: 65 },
  hp: 1000,
  radius: 58,
  mass: 1.2,
  baseSpeed: 450,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 150,
  hitInterval: 0.5,
  contactDamage: 45,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2,
    cooldown: 3.6,
    windup: 0.3,
    passive(_world, self) {
      // Lionheart: the closer to death, the harder he hits.
      self.damageMul = 1 + Math.min(1, Math.max(0, 1 - self.hp / self.maxHp));
    },
    onWindup(world, self) {
      self.speedMul = 0.5;
      world.emit({ type: "charge", fighter: self.index });
    },
    cast(world, self, level) {
      self.speedMul = 1;
      const reach = 150 + 30 * (level - 1);
      world.emit({ type: "stomp", fighter: self.index, x: self.x, y: self.y, radius: reach });
      hitAround(world, self, self.x, self.y, reach, CRY.damage, CRY.knockback);
      damageUnitsNear(world, self, self.x, self.y, reach, CRY.damage);
    },
    onEnd(_world, self) {
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
    },
    ultimate: {
      name: "ARSUF",
      active: 1.2,
      cast() {},
      whileActive(world, self, dt, t) {
        // Two waves of crusader knights ride across the field.
        if (ticks(t, dt, 0.7, 0.05) === 0) return;
        spawnSweep(world, self, {
          style: "knight",
          speed: 640,
          depth: 80,
          count: 4,
          itemHalf: 40,
          damage: 84,
          knockback: 650,
          stun: 0.3,
        });
      },
    },
  }),
};
