/** Restore target-engine ledger metadata. Generated from the frozen migration definitions. */
export const CASE_MIGRATION_METADATA = {
  "sqlite": [
    {
      "version": 1,
      "name": "initial_schema_v1",
      "checksum": "fab6503709aed3a06392d48872804371c8f2f083accb421dcab034978be6f2c8",
      "description": "إنشاء المخطط الأساسي: الأطراف، الملفات، القضايا، الجلسات، الأحكام، الأعمال، المستندات، العقود، المالية، التدقيق، قابلية المزامنة، والبحث المحلي."
    },
    {
      "version": 2,
      "name": "case_intake_and_procedural_history",
      "checksum": "1d2d86db541d21a43c8debd812153be1418211d963ef86eebdb476b5c13f49ec",
      "description": "تصنيف وقوالب ومراحل مستقلة وفهرسة القضايا دون تغيير بيانات v1"
    }
  ],
  "indexeddb": [
    {
      "version": 1,
      "name": "0001_initial",
      "checksum": "2adaccba",
      "description": "Initial portable schema (57 tables)"
    },
    {
      "version": 2,
      "name": "case_intake_and_procedural_history",
      "checksum": "cases-v2-20261019-1",
      "description": "Additive case intake, stages and search facets v2"
    }
  ]
} as const;
