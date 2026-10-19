/** Built-in privacy is a floor, not a configurable switch that can expose old values. */
import { CASE_TEMPLATE_SEED } from '../schema/v2/template-seed.ts';
import type { FieldDefinition, FieldGroup } from './types.ts';

const protectedGroups = new Map<string, Set<string>>();
const protectedFields = new Map<string, Set<string>>();
for (const template of Object.values(CASE_TEMPLATE_SEED)) {
  protectedGroups.set(
    template.typeCode,
    new Set(
      template.groups
        .filter((group) => group.sensitive)
        .map((group) => group.key),
    ),
  );
  protectedFields.set(
    template.typeCode,
    new Set(
      template.groups.flatMap((group) =>
        group.fields
          .filter((field) => group.sensitive || field.sensitive)
          .map((field) => field.key),
      ),
    ),
  );
}

export function isSensitiveCaseGroup(
  typeCode: string,
  group: FieldGroup,
): boolean {
  return Boolean(
    group.sensitive || protectedGroups.get(typeCode)?.has(group.key),
  );
}

export function isSensitiveCaseField(
  typeCode: string,
  group: FieldGroup,
  field: FieldDefinition,
): boolean {
  return (
    isSensitiveCaseGroup(typeCode, group) ||
    Boolean(field.sensitive || protectedFields.get(typeCode)?.has(field.key))
  );
}
