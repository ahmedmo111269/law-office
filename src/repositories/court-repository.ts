import { AppError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/current-registry.ts';
import {
  BaseRepository,
  type EntityRecord,
  type RepositoryDependencies,
} from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface CourtRecord extends EntityRecord {
  readonly name: string;
  readonly court_kind_id: string | null;
  readonly parent_id: string | null;
  readonly governorate_id: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly is_active: number;
}

export interface CourtCircuitRecord extends EntityRecord {
  readonly court_id: string;
  readonly name: string;
  readonly location: string | null;
  readonly is_active: number;
}

export class CourtRepository {
  private readonly lookups: LookupRepository;
  private readonly courts: BaseRepository<CourtRecord>;
  private readonly circuits: BaseRepository<CourtCircuitRecord>;

  constructor(deps: RepositoryDependencies, lookups: LookupRepository) {
    this.lookups = lookups;
    this.courts = new BaseRepository<CourtRecord>(deps, getSyncEntity('court'));
    this.circuits = new BaseRepository<CourtCircuitRecord>(
      deps,
      getSyncEntity('court_circuit'),
    );
  }

  createCourt(input: {
    name: string;
    courtKindCode?: string;
    governorateCode?: string;
    parentId?: string;
    address?: string;
    phone?: string;
    notes?: string;
  }): CourtRecord {
    if (!input.name?.trim())
      throw new ValidationError('court name is required');
    if (input.parentId) this.courts.requireById(input.parentId);
    return this.courts.insert({
      name: input.name.trim(),
      court_kind_id: this.lookups.resolveOptional(
        'court_kind',
        input.courtKindCode,
      ),
      parent_id: input.parentId ?? null,
      governorate_id: this.lookups.resolveOptional(
        'governorate',
        input.governorateCode,
      ),
      address: input.address ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      is_active: 1,
      archived_at: null,
    });
  }

  createCircuit(
    courtId: string,
    input: { name: string; location?: string; notes?: string },
  ): CourtCircuitRecord {
    const court = this.courts.requireById(courtId);
    if (court.is_active !== 1)
      throw new AppError('INVALID_STATE', 'court is inactive');
    if (!input.name?.trim())
      throw new ValidationError('circuit name is required');
    return this.circuits.insert({
      court_id: courtId,
      name: input.name.trim(),
      location: input.location ?? null,
      notes: input.notes ?? null,
      is_active: 1,
    });
  }

  getCourt(id: string): CourtRecord {
    return this.courts.requireById(id);
  }

  getCircuit(id: string): CourtCircuitRecord {
    return this.circuits.requireById(id);
  }

  requireCircuitOfCourt(
    circuitId: string,
    courtId: string,
  ): CourtCircuitRecord {
    const circuit = this.circuits.requireById(circuitId);
    if (circuit.court_id !== courtId) {
      throw new ValidationError(
        'circuit does not belong to the selected court',
        {
          circuitId,
          courtId,
        },
      );
    }
    return circuit;
  }

  listCourts(
    options: { activeOnly?: boolean; limit?: number } = {},
  ): CourtRecord[] {
    return this.courts.list({
      filters:
        (options.activeOnly ?? true) ? [{ column: 'is_active', value: 1 }] : [],
      limit: options.limit ?? 100,
      orderBy: { column: 'name', direction: 'asc' },
    });
  }

  listCircuits(courtId: string): CourtCircuitRecord[] {
    return this.circuits.list({
      filters: [{ column: 'court_id', value: courtId }],
      limit: 200,
      orderBy: { column: 'name', direction: 'asc' },
    });
  }

  getCourtFull(id: string): {
    court: CourtRecord;
    circuits: CourtCircuitRecord[];
  } {
    return { court: this.getCourt(id), circuits: this.listCircuits(id) };
  }
}
