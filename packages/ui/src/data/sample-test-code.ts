// SPDX-License-Identifier: Apache-2.0
// The code of the sample's tests, as each change's branch has it, for «Ver código»; and the two
// sample unlocks (ADR 0014), with the patch to their test and the code that supports it.
import type { UnlockEvidence } from "@baquia-dev/specty-core";
import { ActionError, type ChangeRecord } from "./records";

/** What an unlock carries besides its paths and its reason: the change to the test, and why. */
interface SampleUnlock {
  readonly patch: string;
  readonly evidence: readonly UnlockEvidence[];
}

const GRADE_NOTICE_TEST = `import 'package:flutter_test/flutter_test.dart';
import 'package:mi_colegio/grades/grade_notice.dart';

import '../support.dart';

void main() {
  group('AC1: a published grade notifies the family', () {
    test('the family of the student gets a notice', () async {
      final inbox = FakeNoticeInbox();
      await GradeNotices(inbox: inbox).published(mathGrade(ana));
      expect(inbox.sentTo(ana.family), hasLength(1));
    });

    test('a draft grade notifies nobody', () async {
      final inbox = FakeNoticeInbox();
      await GradeNotices(inbox: inbox).saved(mathGrade(ana));
      expect(inbox.sent, isEmpty);
    });
  });
}
`;

const NOTICE_VIEW_TEST = `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mi_colegio/grades/grade_notice.dart';

void main() {
  testWidgets('AC2: the open notice shows the grade and the subject', (tester) async {
    const notice = GradeNotice(subject: 'Ciencias naturales', value: 4.2);
    await tester.pumpWidget(const MaterialApp(home: GradeNoticeView(notice: notice)));
    expect(find.text('Ciencias naturales'), findsOneWidget);
    expect(find.text('4,2'), findsOneWidget);
  });
}
`;

/** Locked, as it was approved: S2 asks to change its last test. */
const REPORT_CARD_TEST = `import 'package:flutter_test/flutter_test.dart';
import 'package:mi_colegio/reports/pdf/report_card.dart';

import '../support.dart';

void main() {
  testWidgets('report card lists grades, averages and remarks', (tester) async {
    await tester.pumpWidget(preview(ReportCard(student: ana, period: firstTerm)));
    expect(find.text('Matemáticas'), findsOneWidget);
    expect(find.text('Promedio 4,3'), findsOneWidget);
  });

  testWidgets('report card footer shows the signature', (tester) async {
    await tester.pumpWidget(preview(ReportCard(student: ana, period: firstTerm)));
    expect(find.text('Firma del rector'), findsOneWidget);
  });
}
`;

/** Locked, as S1 left it once approved for T1. */
const GOOGLE_PROVIDER_TEST = `import 'package:flutter_test/flutter_test.dart';
import 'package:mi_colegio/auth/google_provider.dart';

import '../support.dart';

void main() {
  test('signs in with a registered Google account', () async {
    final provider = GoogleProvider(client: FakeGoogleClient(account: ana));
    expect(await provider.signIn(), ana);
  });

  test('signs out and forgets the account', () async {
    final provider = GoogleProvider(client: FakeGoogleClient(account: ana));
    await provider.signIn();
    await provider.signOut();
    expect(provider.current, isNull);
  });
}
`;

/** The tests of each sample change that has some: sent, locked or unlocked. */
const TEST_CODE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "20261022-avisos-calificaciones": {
    "test/grades/grade_notice_test.dart": GRADE_NOTICE_TEST,
    "test/grades/notice_view_test.dart": NOTICE_VIEW_TEST,
  },
  "20261019-boletines-pdf": { "test/reports/report_card_test.dart": REPORT_CARD_TEST },
  "20261021-login-google": { "test/auth/google_provider_test.dart": GOOGLE_PROVIDER_TEST },
};

/** S2 of «Exportar boletines en PDF», pending: T3 signs with whom the school chose. */
export const REPORT_CARD_UNLOCK: SampleUnlock = {
  patch: `diff --git a/test/reports/report_card_test.dart b/test/reports/report_card_test.dart
--- a/test/reports/report_card_test.dart
+++ b/test/reports/report_card_test.dart
@@ -13,4 +13,4 @@ void main() {
   testWidgets('report card footer shows the signature', (tester) async {
     await tester.pumpWidget(preview(ReportCard(student: ana, period: firstTerm)));
-    expect(find.text('Firma del rector'), findsOneWidget);
+    expect(find.text('Firma de \${school.signedBy}'), findsOneWidget);
   });
`,
  evidence: [
    {
      path: "lib/school/school_profile.dart",
      from: 12,
      to: 13,
      text: "  /// Who signs the report cards, as the school set it up: «la rectora», «el director»…\n  final String signedBy;",
    },
  ],
};

/** S1 of «Login con Google», approved for T1: signing out returns nothing. */
export const GOOGLE_PROVIDER_UNLOCK: SampleUnlock = {
  patch: `diff --git a/test/auth/google_provider_test.dart b/test/auth/google_provider_test.dart
--- a/test/auth/google_provider_test.dart
+++ b/test/auth/google_provider_test.dart
@@ -12,5 +12,6 @@ void main() {
   test('signs out and forgets the account', () async {
     final provider = GoogleProvider(client: FakeGoogleClient(account: ana));
     await provider.signIn();
-    expect(await provider.signOut(), isTrue);
+    await provider.signOut();
+    expect(provider.current, isNull);
   });
`,
  evidence: [
    {
      path: "lib/auth/auth_provider.dart",
      from: 6,
      to: 10,
      text: [
        "abstract interface class AuthProvider {",
        "  Future<Account?> signIn();",
        "",
        "  /// Closes the session. It never fails, so it returns nothing.",
        "  Future<void> signOut();",
      ].join("\n"),
    },
  ],
};

/**
 * The code of `path`, a test of the sample change `change`, for the prototype's source: a change
 * the sample does not have, or a path that is not one of its tests, is refused as the server does.
 */
export function sampleTestCode(
  records: readonly ChangeRecord[],
  change: string,
  path: string,
): Promise<string> {
  if (!records.some((record) => record.state.id === change)) {
    return Promise.reject(
      new ActionError({
        es: `No existe el cambio ${change}.`,
        en: `There is no change ${change}.`,
      }),
    );
  }
  const code = TEST_CODE[change]?.[path];
  if (code !== undefined) return Promise.resolve(code);
  return Promise.reject(
    new ActionError({
      es: "No se puede mostrar el código de este test: no es un test del cambio o no se pudo leer.",
      en: "This test's code cannot be shown: it is not a test of the change, or it could not be read.",
    }),
  );
}
