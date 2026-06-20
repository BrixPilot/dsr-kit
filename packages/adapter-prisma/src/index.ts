import type { PrismaClient } from "@prisma/client";
import {
  getSubjectLinkField,
  type RedactSentinels,
  type DataMap,
  type ResidueMatch,
  type SchemaIntrospection,
  type StorageAdapter,
  type SubjectId,
} from "@dsr-kit/core";

export interface PrismaAdapterConfig {
  prisma: PrismaClient;
  dataMap: DataMap;
  modelMap?: Record<string, string>;
  sentinels?: RedactSentinels;
}

const DEFAULT_SENTINELS: RedactSentinels = {
  string: "[redacted]",
  email: "deleted@redacted.local",
  number: 0,
};

function delegate(config: PrismaAdapterConfig, model: string): Record<string, unknown> {
  const prismaName = config.modelMap?.[model] ?? model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (config.prisma as unknown as Record<string, unknown>)[prismaName];
  if (!delegate || typeof delegate !== "object") {
    throw new Error(`Prisma model delegate "${prismaName}" not found`);
  }
  return delegate as Record<string, unknown>;
}

function subjectWhere(config: PrismaAdapterConfig, subject: SubjectId, model: string) {
  const linkField = getSubjectLinkField(config.dataMap, model);
  return { [linkField]: subject.value };
}

export function createPrismaAdapter(config: PrismaAdapterConfig): StorageAdapter {
  const sentinels = { ...DEFAULT_SENTINELS, ...config.sentinels };

  return {
    async introspectSchema(): Promise<SchemaIntrospection> {
      const models = Object.keys(config.dataMap.models).map((name) => {
        const decl = config.dataMap.models[name];
        const columns = Object.keys(decl.fields ?? {}).map((col) => ({
          name: col,
          isPersonal: true,
        }));
        if (decl.parent) {
          columns.push({
            name: getSubjectLinkField(config.dataMap, name),
            isPersonal: false,
          });
        }
        return { name, columns };
      });
      return { models };
    },

    async countBySubject(subject, model) {
      const d = delegate(config, model);
      const count = await (d.count as (args: unknown) => Promise<number>)({
        where: subjectWhere(config, subject, model),
      });
      return count;
    },

    async deleteBySubject(subject, model, _options = {}) {
      const d = delegate(config, model);
      const where = subjectWhere(config, subject, model);
      const count = await (d.count as (args: unknown) => Promise<number>)({ where });
      if (count === 0) return { affected: 0, retained: 0 };

      const result = await (d.deleteMany as (args: unknown) => Promise<{ count: number }>)({
        where,
      });
      return { affected: result.count, retained: 0 };
    },

    async redactBySubject(subject, model, fields, options = {}) {
      const d = delegate(config, model);
      const where = subjectWhere(config, subject, model);
      const rows = await (d.findMany as (args: unknown) => Promise<Record<string, unknown>[]>)({
        where,
        take: options.batchSize ?? 100,
      });

      let affected = 0;
      let retained = 0;

      for (const row of rows) {
        const updates: Record<string, unknown> = {};
        let hasChange = false;

        for (const [field, action] of Object.entries(fields)) {
          if (action === "RETAIN") {
            retained++;
            continue;
          }
          if (action === "REDACT" || action === "DELETE") {
            const current = row[field];
            if (current === null || current === undefined) continue;
            if (field.includes("email")) {
              updates[field] = sentinels.email;
            } else if (typeof current === "number") {
              updates[field] = sentinels.number;
            } else {
              updates[field] = sentinels.string;
            }
            hasChange = true;
          }
        }

        if (hasChange && row.id) {
          await (d.update as (args: unknown) => Promise<unknown>)({
            where: { id: row.id },
            data: updates,
          });
          affected++;
        }
      }

      return { affected, retained };
    },

    async exportBySubject(subject, model, fields, options = {}) {
      const d = delegate(config, model);
      const where = subjectWhere(config, subject, model);
      const select =
        fields.includes("*") || fields.length === 0
          ? undefined
          : Object.fromEntries(fields.map((f) => [f, true]));

      const rows = await (d.findMany as (args: unknown) => Promise<Record<string, unknown>[]>)({
        where,
        ...(select ? { select } : {}),
        take: options.batchSize ?? 1000,
      });
      return rows;
    },

    async findResidue(subject, model, fields) {
      const d = delegate(config, model);
      const where = subjectWhere(config, subject, model);
      const rows = await (d.findMany as (args: unknown) => Promise<Record<string, unknown>[]>)({
        where,
      });

      const residues: ResidueMatch[] = [];
      for (const field of fields) {
        let count = 0;
        for (const row of rows) {
          const val = row[field];
          if (val !== null && val !== undefined && val !== sentinels.string && val !== sentinels.email && val !== sentinels.number) {
            if (typeof val === "string" && val.includes("redacted")) continue;
            count++;
          }
        }
        if (count > 0) residues.push({ model, field, count });
      }
      return residues;
    },

    async transaction(fn) {
      return config.prisma.$transaction(async () => fn());
    },
  };
}
