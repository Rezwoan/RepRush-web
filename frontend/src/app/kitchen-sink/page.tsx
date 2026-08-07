'use client';
/**
 * Design-system proof sheet. Renders every v2 primitive so a theme, token or
 * art change can be eyeballed in one place instead of hunted across screens.
 * Dev surface, not a product page — it is excluded from the sitemap and nav.
 */
import { useMemo, useState } from 'react';
import { Bookmark, Flame, Star } from 'lucide-react';
import { Bodygraph, BodygraphPair } from '@/components/art/bodygraph';
import { EquipmentIcon, EQUIPMENT } from '@/components/art/equipment-icon';
import { Mascot, MascotSays, type MascotPose } from '@/components/art/mascot';
import { Medal, MEDAL_EMBLEMS, MEDAL_MATERIALS } from '@/components/art/medal';
import { RankBadge, RankChip } from '@/components/art/rank-badge';
import { Button } from '@/components/ui/button';
import { Celebration, CoachMark, Rays } from '@/components/ui/celebration';
import { Chip, OptionCard, Segmented, TabBarLinks, Toggle } from '@/components/ui/controls';
import { Bar, EmptyState, Ring, RingStack, StatTile } from '@/components/ui/display';
import { RulerPicker, WheelPicker } from '@/components/ui/pickers';
import { Sheet } from '@/components/ui/sheet';
import { TabBar } from '@/components/layout/tab-bar';
import { TopBar } from '@/components/layout/top-bar';
import { useTheme } from '@/lib/theme-context';
import { THEMES, THEME_GROUPS } from '@/lib/themes';
import { TIERS, type Tier } from '@/lib/ranks';
import { MUSCLES, type MuscleId } from '@/lib/muscles';
import { __selfcheck as ranksCheck } from '@/lib/ranks';
import { __selfcheck as musclesCheck } from '@/lib/muscles';
import { __selfcheck as themesCheck } from '@/lib/themes';
import { __selfcheck as bodygraphCheck } from '@/components/art/bodygraph';
import { __selfcheck as badgeCheck } from '@/components/art/rank-badge';
import { __selfcheck as medalCheck } from '@/components/art/medal';
import { __selfcheck as equipmentCheck } from '@/components/art/equipment-icon';
import { __selfcheck as keypadCheck } from '@/components/workout/keypad';
import { __selfcheck as restCheck } from '@/components/workout/rest-timer';
import { __selfcheck as feedbackCheck } from '@/lib/feedback';

const POSES: MascotPose[] = ['idle', 'cheer', 'flex', 'fire', 'sleep', 'sad'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Runs the pure-logic self-checks in the browser and shows pass/fail. */
function SelfChecks() {
  const results = [
    ['themes', themesCheck],
    ['muscles', musclesCheck],
    ['ranks', ranksCheck],
    ['bodygraph', bodygraphCheck],
    ['rank badges', badgeCheck],
    ['medals', medalCheck],
    ['equipment', equipmentCheck],
    ['keypad', keypadCheck],
    ['rest timer', restCheck],
    ['feedback', feedbackCheck],
  ] as const;
  return (
    <ul className="space-y-1 text-sm">
      {results.map(([name, fn]) => {
        let ok = true;
        let msg = '';
        try {
          msg = fn();
        } catch (e) {
          ok = false;
          msg = (e as Error).message;
        }
        return (
          <li key={name} className={ok ? 'text-success' : 'text-destructive'}>
            {ok ? '✓' : '✗'} {name}: {msg}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A plausible rank spread so the Bodygraph shows the real tier palette.
 * Module scope: it never changes, so it must not be rebuilt per render.
 */
const DEMO_COLORS = Object.fromEntries(
  MUSCLES.map((m, i) => [m.id, `hsl(var(--tier-${TIERS[(i % (TIERS.length - 1)) + 1]}))`]),
) as Partial<Record<MuscleId, string>>;

/**
 * Each interactive area owns its own state.
 *
 * This is not tidiness — it is the fix for a renderer freeze. A ruler picker
 * emits a value on every snapped tick, i.e. many times a second during a drag.
 * With all of this page's state in one component, each of those ticks
 * re-rendered ~3000 nodes of Bodygraph, badges, medals and theme chips, and the
 * tab locked up. Scoped state keeps the blast radius to the section in hand.
 */
function BodygraphSection() {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [tapped, setTapped] = useState<MuscleId | null>(null);
  return (
    <Section title="Bodygraph">
      <div className="surface space-y-3 p-4">
        <Segmented
          options={[
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
          ]}
          value={view}
          onChange={setView}
        />
        <div className="flex h-80 justify-center">
          <Bodygraph view={view} colors={DEMO_COLORS} onMuscleClick={setTapped} />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {tapped ? `Tapped: ${tapped}` : 'Tap a muscle'}
        </p>
      </div>
      <div className="surface h-72 p-4">
        <BodygraphPair colors={DEMO_COLORS} interactive={false} />
      </div>
    </Section>
  );
}

function ControlsSection() {
  const [seg, setSeg] = useState<'duration' | 'volume' | 'reps'>('duration');
  const [tab, setTab] = useState<'you' | 'friends' | 'discovery'>('you');
  const [toggle, setToggle] = useState(true);
  const [picked, setPicked] = useState<string[]>(['barbell']);
  return (
    <Section title="Controls">
      <TabBarLinks
        options={[
          { value: 'you', label: 'For You' },
          { value: 'friends', label: 'Friends' },
          { value: 'discovery', label: 'Discovery' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Segmented
        options={[
          { value: 'duration', label: 'Duration' },
          { value: 'volume', label: 'Volume' },
          { value: 'reps', label: 'Reps' },
        ]}
        value={seg}
        onChange={setSeg}
      />
      <div className="rail no-scrollbar">
        <Chip active>1h</Chip>
        <Chip>Intermediate</Chip>
        <Chip>Equipment (26/97)</Chip>
        <Chip>Rest 90s</Chip>
        <Chip>Push</Chip>
      </div>
      <div className="surface flex items-center justify-between p-4">
        <span className="font-semibold">Rest timer alert</span>
        <Toggle checked={toggle} onChange={setToggle} label="Rest timer alert" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {EQUIPMENT.slice(0, 4).map((e) => (
          <OptionCard
            key={e}
            multi
            label={e}
            sublabel="Available at your gym"
            icon={<EquipmentIcon equipment={e} size={26} />}
            selected={picked.includes(e)}
            onClick={() => setPicked((p) => (p.includes(e) ? p.filter((x) => x !== e) : [...p, e]))}
          />
        ))}
      </div>
    </Section>
  );
}

function PickersSection() {
  const [weight, setWeight] = useState(81.5);
  const [height, setHeight] = useState(178);
  const [age, setAge] = useState(25);
  const ages = useMemo(() => Array.from({ length: 73 }, (_, i) => i + 13), []);
  return (
    <Section title="Pickers">
      <div className="surface p-4">
        <RulerPicker
          value={weight}
          onChange={setWeight}
          min={30}
          max={200}
          step={0.5}
          unit="kg"
          label="Bodyweight"
        />
      </div>
      <div className="surface flex items-center justify-around p-4">
        <RulerPicker
          value={height}
          onChange={setHeight}
          min={120}
          max={220}
          unit="cm"
          orientation="vertical"
          label="Height"
        />
        <div>
          <p className="mb-2 text-center text-sm text-muted-foreground">Age</p>
          <WheelPicker options={ages} value={age} onChange={setAge} label="Age" />
        </div>
      </div>
    </Section>
  );
}

function OverlaysSection() {
  const [sheet, setSheet] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [coach, setCoach] = useState(false);
  return (
    <>
      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheet(true)}>Open sheet</Button>
          <Button variant="volt" onClick={() => setCelebrate(true)}>
            Celebrate
          </Button>
          <Button variant="secondary" onClick={() => setCoach(true)}>
            Coach mark
          </Button>
        </div>
        <div className="surface relative grid h-48 place-items-center overflow-hidden p-4">
          <Rays color="hsl(var(--primary))" />
          <Flame className="relative text-tier-gold" size={48} />
        </div>
      </Section>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Add Friends"
        description="Find your crew and keep each other honest."
        footer={
          <Button variant="chunky" size="cta" onClick={() => setSheet(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-2">
          <OptionCard label="Invite Your Friends" icon={<Star size={20} />} />
          <OptionCard label="Search by username" icon={<Bookmark size={20} />} />
        </div>
      </Sheet>

      <Celebration
        open={celebrate}
        onDismiss={() => setCelebrate(false)}
        eyebrow="Rank up"
        title="Gold I"
        subtitle="Bench Press · stronger than 71% of lifters"
        hero={<RankBadge tier="gold" division={1} size="xl" entrance />}
        actionLabel="More gains ahead"
        rayColor="hsl(var(--tier-gold))"
      />

      <CoachMark
        open={coach}
        onNext={() => setCoach(false)}
        step={1}
        total={3}
        text="Your Bodygraph fills in as you train. Chase the pale muscles."
      />
    </>
  );
}

function DisplaySection() {
  return (
    <Section title="Display">
      <div className="surface flex flex-wrap items-center justify-around gap-4 p-4">
        <Ring value={0.68} label="Calories">
          <div>
            <p className="nums text-2xl font-extrabold">742</p>
            <p className="text-xs text-muted-foreground">left</p>
          </div>
        </Ring>
        <RingStack
          rings={[
            { value: 0.68, color: 'hsl(var(--primary))', label: 'Calories' },
            { value: 0.45, color: 'hsl(var(--tier-platinum))', label: 'Protein' },
            { value: 0.8, color: 'hsl(var(--accent))', label: 'Carbs' },
          ]}
        >
          <span className="nums text-xl font-extrabold">68%</span>
        </RingStack>
      </div>
      <div className="flex gap-3">
        <StatTile label="Duration" value="52" unit="m" />
        <StatTile label="Records" value="3" sub={<span className="text-success">+2 this week</span>} />
        <StatTile label="Burned" value="418" unit="cal" />
      </div>
      <div className="surface space-y-3 p-4">
        <Bar value={0.34} label="To next rank" />
        <Bar value={0.72} color="hsl(var(--accent))" />
        <Bar value={1} color="hsl(var(--success))" />
      </div>
      <div className="surface">
        <EmptyState
          title="No routines yet"
          description="Build one and it shows up here for one-tap starts."
          pose="sad"
          action={
            <Button variant="chunky" size="cta">
              Create routine
            </Button>
          }
        />
      </div>
    </Section>
  );
}

function ArtSection() {
  return (
    <>
      <Section title="Rank badges">
        <div className="surface flex flex-wrap items-end gap-4 p-4">
          {TIERS.map((t) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <RankBadge tier={t as Tier} division={2} size="lg" />
              <span className="text-[11px] capitalize text-muted-foreground">{t}</span>
            </div>
          ))}
        </div>
        <div className="surface flex flex-wrap items-center gap-4 p-4">
          <RankBadge tier="gold" division={1} size="xl" />
          <RankBadge tier="diamond" division={3} size="md" locked />
          <RankChip rank={{ tier: 'platinum', division: 2, lp: 40, percentile: 71 }} />
          <RankChip rank={null} />
        </div>
      </Section>

      <Section title="Medals">
        <div className="surface flex flex-wrap gap-3 p-4">
          {(Object.keys(MEDAL_EMBLEMS) as (keyof typeof MEDAL_EMBLEMS)[]).map((emblem, i) => (
            <Medal
              key={emblem}
              emblem={emblem}
              material={
                (Object.keys(MEDAL_MATERIALS) as (keyof typeof MEDAL_MATERIALS)[])[
                  i % Object.keys(MEDAL_MATERIALS).length
                ]
              }
            />
          ))}
          <Medal emblem="star" locked />
        </div>
      </Section>

      <Section title="Mascot">
        <div className="surface flex flex-wrap items-end gap-2 p-4">
          {POSES.map((p) => (
            <div key={p} className="flex flex-col items-center">
              <Mascot pose={p} size={82} />
              <span className="text-[11px] text-muted-foreground">{p}</span>
            </div>
          ))}
        </div>
        <MascotSays pose="flex">Target your lowest-ranked muscles and the gains follow.</MascotSays>
      </Section>

      <Section title="Equipment">
        <div className="surface flex flex-wrap gap-3 p-4">
          {EQUIPMENT.map((e, i) => (
            <EquipmentIcon
              key={e}
              equipment={e}
              size={44}
              boxed
              group={(['chest', 'back', 'shoulders', 'arms', 'core', 'legs'] as const)[i % 6]}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

function ButtonsSection() {
  return (
    <Section title="Buttons">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['brand', 'volt', 'secondary', 'outline', 'ghost', 'danger'] as const).map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <Button variant="chunky" size="cta">
          Start Workout
        </Button>
        <Button variant="chunkyGold" size="cta">
          Challenge accepted
        </Button>
        <Button variant="chunkyLight" size="cta">
          Continue
        </Button>
        <Button variant="chunkyOutline" size="cta">
          Skip
        </Button>
        <Button variant="chunky" size="cta" disabled>
          Disabled
        </Button>
      </div>
    </Section>
  );
}

function ThemeSection() {
  const { themeId, setThemeId } = useTheme();
  return (
    <Section title="Themes">
      <div className="space-y-4">
        {THEME_GROUPS.map((g) => {
          const items = THEMES.filter((t) => t.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id}>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {items.map((t) => (
                  <Chip key={t.id} active={t.id === themeId} onClick={() => setThemeId(t.id)}>
                    {t.name}
                    {t.price > 0 && <span className="text-xs opacity-70">{t.price}</span>}
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export default function KitchenSink() {
  return (
    <>
      <TopBar level={7} levelProgress={0.42} streak={12} currency={340} unread={3} />

      <main className="mx-auto max-w-2xl space-y-10 px-4 pb-32 pt-6">
        <header>
          <h1 className="text-3xl font-extrabold">Kitchen Sink</h1>
          <p className="text-muted-foreground">Every v2 primitive, in the current theme.</p>
        </header>

        <Section title="Self-checks">
          <div className="surface p-4">
            <SelfChecks />
          </div>
        </Section>

        <ThemeSection />
        <ButtonsSection />
        <ArtSection />
        <BodygraphSection />
        <ControlsSection />
        <PickersSection />
        <DisplaySection />
        <OverlaysSection />
      </main>

      <TabBar />
    </>
  );
}
