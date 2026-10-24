// SPDX-License-Identifier: Apache-2.0
// The diffs of the sample change «Panel de asistencia por curso», written out as `git diff` would:
// T1 changes the repository and its test, T2 adds the panel and its test.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${…}` belong to the sample's Dart.
import { ActionError, type ChangeRecord } from "./records";

type Line = readonly [" " | "+" | "-", string];

interface Hunk {
  readonly old: number;
  readonly new: number;
  readonly section?: string;
  readonly lines: readonly Line[];
}

interface SampleFile {
  readonly path: string;
  readonly added?: boolean;
  readonly index: string;
  readonly hunks: readonly Hunk[];
}

const ctx = (text: string): Line => [" ", text];
const add = (text: string): Line => ["+", text];
const del = (text: string): Line => ["-", text];

const REPOSITORY: SampleFile = {
  path: "lib/attendance/attendance_repository.dart",
  index: "4b1e2a0..9c3d7f1 100644",
  hunks: [
    {
      old: 1,
      new: 1,
      lines: [
        ctx("import 'package:sqflite/sqflite.dart';"),
        ctx(""),
        ctx("import 'attendance_record.dart';"),
        add("import 'week.dart';"),
        ctx(""),
        ctx("class AttendanceRepository {"),
        ctx("  AttendanceRepository(this._db);"),
      ],
    },
    {
      old: 10,
      new: 11,
      section: "class AttendanceRepository {",
      lines: [
        ctx("  Future<List<AttendanceRecord>> recordsFor(String courseId) async {"),
        del(
          "    final rows = await _db.query('attendance', where: 'course_id = ?', whereArgs: [courseId]);",
        ),
        add(
          "    final rows = await _db.query('attendance', where: 'course_id = ?', whereArgs: [courseId], orderBy: 'date');",
        ),
        ctx("    return rows.map(AttendanceRecord.fromRow).toList();"),
        ctx("  }"),
        add(""),
        add("  /// Porcentaje de asistencia de un curso en una semana, de 0 a 100."),
        add("  Future<double> weeklyPercentage(String courseId, Week week) async {"),
        add("    final inWeek = (await recordsFor(courseId)).where((r) => week.contains(r.date));"),
        add("    if (inWeek.isEmpty) return 0;"),
        add("    final present = inWeek.where((r) => r.present).length;"),
        add("    return present * 100 / inWeek.length;"),
        add("  }"),
        add(""),
        add("  /// Estudiantes con más de [limit] ausencias en la semana, de más a menos."),
        add(
          "  Future<List<StudentAbsences>> studentsOverAbsences(String courseId, Week week, {int limit = 3}) async {",
        ),
        add("    final absences = <String, int>{};"),
        add("    for (final r in await recordsFor(courseId)) {"),
        add("      if (week.contains(r.date) && !r.present) {"),
        add("        absences.update(r.studentId, (n) => n + 1, ifAbsent: () => 1);"),
        add("      }"),
        add("    }"),
        add("    return ["),
        add("      for (final e in absences.entries)"),
        add("        if (e.value > limit) StudentAbsences(e.key, e.value),"),
        add("    ]..sort((a, b) => b.count.compareTo(a.count));"),
        add("  }"),
        ctx("}"),
      ],
    },
  ],
};

const REPOSITORY_TEST: SampleFile = {
  path: "test/attendance/attendance_repository_test.dart",
  index: "7a0c5e2..e1b94d0 100644",
  hunks: [
    {
      old: 18,
      new: 18,
      section: "void main() {",
      lines: [
        ctx("  test('reads the records of a course in date order', () async {"),
        ctx("    final repo = AttendanceRepository(await seededDatabase());"),
        del("    expect(await repo.recordsFor('5A'), hasLength(12));"),
        add("    expect(await repo.recordsFor('5A'), hasLength(14));"),
        ctx("  });"),
        add(""),
        add("  test('weekly percentage per course', () async {"),
        add("    final repo = AttendanceRepository(await seededDatabase());"),
        add(
          "    expect(await repo.weeklyPercentage('5A', Week.of(DateTime(2026, 10, 12))), 85.7);",
        ),
        add("  });"),
        add(""),
        add("  test('keeps courses without classes at 0 %', () async {"),
        add("    final repo = AttendanceRepository(await seededDatabase());"),
        add("    expect(await repo.weeklyPercentage('6B', Week.of(DateTime(2026, 10, 12))), 0);"),
        add("  });"),
        ctx("}"),
      ],
    },
  ],
};

const PANEL: SampleFile = {
  path: "lib/attendance/course_panel.dart",
  added: true,
  index: "0000000..3f2a1b4",
  hunks: [
    {
      old: 0,
      new: 1,
      lines: [
        "import 'package:flutter/material.dart';",
        "",
        "import 'attendance_repository.dart';",
        "import 'week.dart';",
        "",
        "/// Panel de asistencia de un curso: porcentaje de la semana y estudiantes destacados.",
        "class CoursePanel extends StatelessWidget {",
        "  const CoursePanel({super.key, required this.course, required this.week});",
        "",
        "  final Course course;",
        "  final Week week;",
        "",
        "  @override",
        "  Widget build(BuildContext context) {",
        "    final repository = context.read<AttendanceRepository>();",
        "    return FutureBuilder(",
        "      future: Future.wait([",
        "        repository.weeklyPercentage(course.id, week),",
        "        repository.studentsOverAbsences(course.id, week),",
        "      ]),",
        "      builder: (context, snapshot) {",
        "        final data = snapshot.data;",
        "        if (data == null) return const Center(child: CircularProgressIndicator());",
        "        final percentage = data[0] as double;",
        "        final highlighted = data[1] as List<StudentAbsences>;",
        "        return Column(",
        "          crossAxisAlignment: CrossAxisAlignment.start,",
        "          children: [",
        "            Text('${percentage.toStringAsFixed(0)} %', style: Theme.of(context).textTheme.displaySmall),",
        "            Text('Asistencia de la semana ${week.label}'),",
        "            const SizedBox(height: 16),",
        "            for (final student in highlighted)",
        "              ListTile(",
        "                leading: const Icon(Icons.warning_amber),",
        "                title: Text(student.name),",
        "                trailing: Text('${student.count} ausencias'),",
        "                tileColor: Theme.of(context).colorScheme.errorContainer,",
        "              ),",
        "          ],",
        "        );",
        "      },",
        "    );",
        "  }",
        "}",
      ].map(add),
    },
  ],
};

const PANEL_TEST: SampleFile = {
  path: "test/attendance/course_panel_test.dart",
  added: true,
  index: "0000000..b52e8c7",
  hunks: [
    {
      old: 0,
      new: 1,
      lines: [
        "import 'package:flutter_test/flutter_test.dart';",
        "import 'package:mi_colegio/attendance/course_panel.dart';",
        "",
        "import '../support.dart';",
        "",
        "void main() {",
        "  testWidgets('shows the weekly percentage of the course', (tester) async {",
        "    await tester.pumpWidget(withRepository(CoursePanel(course: course5A, week: week42)));",
        "    await tester.pumpAndSettle();",
        "    expect(find.text('86 %'), findsOneWidget);",
        "  });",
        "",
        "  testWidgets('highlights students over three absences', (tester) async {",
        "    await tester.pumpWidget(withRepository(CoursePanel(course: course5A, week: week42)));",
        "    await tester.pumpAndSettle();",
        "    expect(find.text('Lucía Pérez'), findsOneWidget);",
        "    expect(find.text('4 ausencias'), findsOneWidget);",
        "  });",
        "}",
      ].map(add),
    },
  ],
};

/** One file as `git diff` writes it; the hunk headers count their own lines. */
function unified(file: SampleFile): string {
  const head = [
    `diff --git a/${file.path} b/${file.path}`,
    ...(file.added ? ["new file mode 100644"] : []),
    `index ${file.index}`,
    file.added ? "--- /dev/null" : `--- a/${file.path}`,
    `+++ b/${file.path}`,
  ];
  const hunks = file.hunks.flatMap((hunk) => {
    const before = hunk.lines.filter(([sign]) => sign !== "+").length;
    const after = hunk.lines.filter(([sign]) => sign !== "-").length;
    const section = hunk.section === undefined ? "" : ` ${hunk.section}`;
    return [
      `@@ -${hunk.old},${before} +${hunk.new},${after} @@${section}`,
      ...hunk.lines.map(([sign, text]) => `${sign}${text}`),
    ];
  });
  return [...head, ...hunks].join("\n");
}

const DIFFS: Readonly<Record<string, Readonly<Record<string, readonly SampleFile[]>>>> = {
  "20261018-asistencia-curso": { T1: [REPOSITORY, REPOSITORY_TEST], T2: [PANEL, PANEL_TEST] },
};

/** The diff of a task, or of the whole change (its tasks' together); empty for the rest. */
export function sampleDiff(change: string, task?: string): string {
  const tasks = DIFFS[change] ?? {};
  const files = task === undefined ? Object.values(tasks).flat() : (tasks[task] ?? []);
  return files.map(unified).join("\n");
}

/** The sample's diff for the prototype's source: a change the sample does not have is refused. */
export function sampleDiffOf(
  records: readonly ChangeRecord[],
  change: string,
  task?: string,
): Promise<string> {
  if (!records.some((record) => record.state.id === change)) {
    return Promise.reject(
      new ActionError({
        es: `No existe el cambio ${change}.`,
        en: `There is no change ${change}.`,
      }),
    );
  }
  return Promise.resolve(sampleDiff(change, task));
}
