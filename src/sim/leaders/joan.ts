import type { Fighter, FighterDef, ZoneHazard } from "../types";
import { damageUnitsNear, spawnZone } from "../units";
import { hitAround, skill, steerToward } from "./kit";
import { mend } from "./domains";

const ABILITY = {
  name: "HOLY BANNER",
  text: "Raises her banner: heals, hits harder, shrugs off shots",
};
/** The rallying shockwave of the great banner. */
const RALLY = { damage: 84, knockback: 600 };
/** HP per second healed by the banners (fixed: tuning scales damage, not healing). */
const HEAL = { banner: 24, great: 45 };
const BANNER = 130;
const GREAT_BANNER = 230;
/**
 * Banners live as long as the move that raised them: they get a long life here and
 * are taken down when the move ends (the move's timer pauses for stuns and ultimate
 * intros, so a fixed life would run out early).
 */
const UNTIL_LOWERED = 99;

/** The banner each Joan is carrying (two Joans can meet), and her great banner. */
const banners = new WeakMap<Fighter, ZoneHazard>();
const greatBanners = new WeakMap<Fighter, ZoneHazard>();

/** She carries the standard into the fight: it moves with her. */
function carry(world: Parameters<typeof steerToward>[0], self: Fighter, dt: number): void {
  for (const b of [banners.get(self), greatBanners.get(self)]) {
    if (!b || b.ttl <= 0) continue;
    b.x = self.x;
    b.y = self.y;
  }
  steerToward(world, self, 2 * dt);
}

function lower(map: WeakMap<Fighter, ZoneHazard>, self: Fighter): void {
  const b = map.get(self);
  if (b) b.ttl = 0;
  map.delete(self);
}

export const joan: FighterDef = {
  id: "joan",
  name: "JOAN OF ARC",
  description:
    "Jeanne d'Arc. Belli aralıklarla kutsal sancağını kaldırıp rakibe yürür; sancak elindeyken can yeniler, daha sert vurur ve mermilerden daha az hasar alır. Seviye atladıkça sancak daha uzun durur. Ultimate'ta (Orléans) dev bir sancak diker: güçlü iyileşme, çok sert vuruşlar ve geri iten bir dalga.",
  era: "1412–1431",
  fact: "At 17 she led the French army that lifted the Siege of Orléans in 1429.",
  fullName: "Joan of Arc",
  sources: ["https://en.wikipedia.org/wiki/Joan_of_Arc"],
  musicMode: "aeolian",
  title: "The Maid of Orléans",
  flag: "fleurdelis",
  ability: ABILITY,
  domain: {
    name: "ORLÉANS",
    rule: "The siege is lifted: Joan heals and holds firm",
    buff: { guard: 0.95 },
    tick(world, self, dt, t) {
      mend(world, self, dt, t, 3);
    },
  },
  growth: { perSecond: 0.015, stat: "BANNER HEAL/S", base: 66 },
  hp: 980,
  radius: 54,
  mass: 1,
  baseSpeed: 480,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 58,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.5,
    cooldown: 4.5,
    active: (level) => 3 + level,
    passive(world, self) {
      // Standing by one of her banners she hits harder (the great banner even more).
      let mul = 1;
      for (const h of world.hazards) {
        if (h.kind !== "zone" || h.style !== "banner" || h.owner !== self.index || h.ttl <= 0)
          continue;
        if (Math.hypot(self.x - h.x, self.y - h.y) > h.radius + self.radius) continue;
        mul = Math.max(mul, h.radius >= GREAT_BANNER ? 1.8 : 1.4);
      }
      self.damageMul = mul;
    },
    cast(world, self) {
      const z = spawnZone(world, self, {
        style: "banner",
        x: self.x,
        y: self.y,
        radius: BANNER,
        ttl: UNTIL_LOWERED,
        damage: HEAL.banner,
        poison: 0,
        poisonDps: 0,
      });
      banners.set(self, z);
    },
    whileActive(world, self, dt) {
      carry(world, self, dt);
    },
    onEnd(_world, self) {
      lower(banners, self);
    },
    ultimate: {
      name: "SIEGE OF ORLÉANS",
      active: 4,
      cast(world, self) {
        const z = spawnZone(world, self, {
          style: "banner",
          x: self.x,
          y: self.y,
          radius: GREAT_BANNER,
          ttl: UNTIL_LOWERED,
          damage: HEAL.great,
          poison: 0,
          poisonDps: 0,
        });
        greatBanners.set(self, z);
        world.emit({ type: "stomp", fighter: self.index, x: self.x, y: self.y, radius: 200 });
        hitAround(world, self, self.x, self.y, 200, RALLY.damage, RALLY.knockback);
        damageUnitsNear(world, self, self.x, self.y, 200, RALLY.damage);
      },
      whileActive(world, self, dt) {
        carry(world, self, dt);
      },
      onEnd(_world, self) {
        lower(greatBanners, self);
      },
    },
  }),
};
