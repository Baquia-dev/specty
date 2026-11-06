// SPDX-License-Identifier: Apache-2.0
// The code of the sample's tests, as each change's branch has it, for «Ver código».
import { ActionError, type ChangeRecord } from "./records";

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

/** The tests of each sample change that has some: sent, locked or unlocked. */
const TEST_CODE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "20261022-avisos-calificaciones": {
    "test/grades/grade_notice_test.dart": GRADE_NOTICE_TEST,
    "test/grades/notice_view_test.dart": NOTICE_VIEW_TEST,
  },
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
