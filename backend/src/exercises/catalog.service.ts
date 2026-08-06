import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface CatalogExercise {
  id: string;
  name: string;
  /** Our muscle ids (frontend/src/lib/muscles.ts). First entry is the main one. */
  primary: string[];
  secondary: string[];
  equipment: string;
  force: string | null;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  category: string;
  repMin: number;
  repMax: number;
  restSec: number;
  images: string[];
  instructions: string[];
}

interface CatalogFile {
  source: string;
  licence: string;
  upstreamSha: string;
  imageBase: string;
  aliases: Record<string, string | null>;
  exercises: CatalogExercise[];
}

/** What the list endpoint returns — everything but the instructions, which are 80% of the bytes. */
export type SlimExercise = Omit<CatalogExercise, 'instructions' | 'images'> & { image: string | null };

export interface Muscle {
  id: string;
  label: string;
  group: string;
  view: 'front' | 'back' | 'both';
  /** Relative contribution to Bodyrank, and to the recovery half-life. */
  size: number;
}

/**
 * The exercise catalog — 873 public-domain exercises, read from
 * `backend/data/exercises.json` (built by `scripts/build-exercise-catalog.js`).
 *
 * ponytail: this is a file in memory, not a database table. The catalog is
 * static, identical for every user, and 873 rows in sql.js would be rewritten
 * to disk on every unrelated write. User-authored exercises get their own
 * table when P6 needs them; nothing about that requires the stock ones to be
 * rows too.
 */
@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private file: CatalogFile;
  private byId = new Map<string, CatalogExercise>();
  private slim: SlimExercise[] = [];
  /** Generated from frontend/src/lib/muscles.ts by scripts/build-exercise-catalog.js. */
  muscles: Muscle[] = [];
  private muscleById = new Map<string, Muscle>();

  onModuleInit() {
    const dir = join(__dirname, '..', '..', 'data');
    this.file = JSON.parse(readFileSync(join(dir, 'exercises.json'), 'utf8'));
    for (const e of this.file.exercises) this.byId.set(e.id, e);
    this.slim = this.file.exercises.map(({ instructions, images, ...rest }) => ({
      ...rest,
      image: images[0] ? this.file.imageBase + images[0] : null,
    }));

    this.muscles = JSON.parse(readFileSync(join(dir, 'muscles.json'), 'utf8'));
    for (const m of this.muscles) this.muscleById.set(m.id, m);
    this.logger.log(`Exercise catalog loaded: ${this.slim.length} exercises, ${this.muscles.length} muscles`);
  }

  muscle(id: string): Muscle | undefined {
    return this.muscleById.get(id);
  }

  get imageBase() {
    return this.file.imageBase;
  }

  list(filter: { q?: string; muscle?: string; equipment?: string } = {}): SlimExercise[] {
    const q = filter.q?.trim().toLowerCase();
    return this.slim.filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q)) &&
        (!filter.muscle || e.primary.includes(filter.muscle) || e.secondary.includes(filter.muscle)) &&
        (!filter.equipment || e.equipment === filter.equipment),
    );
  }

  get(id: string): CatalogExercise & { images: string[] } {
    const e = this.byId.get(id);
    if (!e) throw new NotFoundException(`Unknown exercise: ${id}`);
    return { ...e, images: e.images.map((i) => this.file.imageBase + i) };
  }

  find(id: string): CatalogExercise | undefined {
    return this.byId.get(id);
  }

  /**
   * Resolve a v1 free-text `workout_sets.exerciseName` to a catalog id.
   * Returns null for names with no catalog equivalent (e.g. "Core Exercise
   * (User Choice)"), which is a legitimate outcome, not a failure.
   */
  resolveLegacyName(name: string): string | null {
    const alias = this.file.aliases[name];
    if (alias !== undefined) return alias;
    // Fall back to an exact case-insensitive name match before giving up.
    const hit = this.file.exercises.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
    return hit ? hit.id : null;
  }
}
