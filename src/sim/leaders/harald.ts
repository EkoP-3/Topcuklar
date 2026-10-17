import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { fan, skill, steerToward } from "./kit";

const AXE_SPEED = 650;
const ABILITY = { name: "THROWING AXE", text: "Spinning axes that fly back to his hand" };

export const harald: FighterDef = {
  id: "harald",
  name: "HARALD III",
  description:
    "Harald Hardrada. Belli aralıklarla dönen balta fırlatır; balta gidip geri döner ve dönüşte de vurabilir. Önce 1, 15. saniyede 2, 30. saniyede 3 balta. Ultimate'ta berserker öfkesine girer: çok hızlanır, çok sert vurur ve daha az hasar alır.",
  era: "c. 1015–1066",
  fact: "Called the last great Viking king; he fell at Stamford Bridge in 1066.",
  fullName: "Harald Hardrada",
  sources: ["https://en.wikipedia.org/wiki/Harald_Hardrada"],
  musicMode: "dorian",
  title: "King of Norway",
  flag: "norway",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "AXE DMG", base: 70 },
  hp: 1020,
  radius: 57,
  mass: 1.15,
  baseSpeed: 460,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 150,
  hitInterval: 0.5,
  contactDamage: 52,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    firstAt: 1.4,
    cooldown: 2.6,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      for (const a of fan(leadAngle(self, enemy, AXE_SPEED), level, 0.35)) {
        fireProjectile(world, self, a, {
          style: "axe",
          speed: AXE_SPEED,
          radius: 16,
          damage: 70,
          knockback: 160,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 1,
          ttl: 4,
          returnIn: 0.55,
          hitIds: [],
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "axe" });
    },
    ultimate: {
      name: "BERSERKER",
      active: 3,
      cast(_world, self) {
        self.speedMul = 1.8;
        self.damageMul = 1.8;
        self.damageTakenMul = 0.7;
        self.trail = true;
      },
      whileActive(world, self, dt) {
        steerToward(world, self, 3 * dt);
      },
      onEnd(_world, self) {
        self.speedMul = 1;
        self.damageMul = 1;
        self.damageTakenMul = 1;
        self.trail = false;
      },
      knockbackMultiplier: 1.6,
    },
  }),
};
