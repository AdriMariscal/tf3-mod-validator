// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkModInfo } from '../src/index.js';
import { codes, only, VALID_MODINFO } from './helpers.js';

/** Checks VALID_MODINFO with some fields overridden; `undefined` removes a field. */
function check(overrides, context) {
  const data = { ...VALID_MODINFO, ...overrides };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) delete data[key];
  }
  return checkModInfo(data, context);
}

describe('modinfo.json: document', () => {
  test('a minimal valid object has no findings', () => {
    assert.deepEqual(check({}), []);
  });

  test('a non-object document is MODINFO_NOT_OBJECT', () => {
    assert.deepEqual(codes(checkModInfo([])), ['MODINFO_NOT_OBJECT']);
  });

  test('findings point at _metadata/modinfo.json', () => {
    assert.equal(only(check({ name: undefined }), 'MODINFO_NAME_MISSING').file, '_metadata/modinfo.json');
  });

  test('unknown top-level fields are MODINFO_UNKNOWN_FIELD warnings', () => {
    assert.equal(only(check({ tag: ['Misc'] }), 'MODINFO_UNKNOWN_FIELD').severity, 'warning');
  });
});

describe('modinfo.json: name and summary', () => {
  test('a missing or blank name is MODINFO_NAME_MISSING', () => {
    assert.deepEqual(codes(check({ name: undefined })), ['MODINFO_NAME_MISSING']);
    assert.deepEqual(codes(check({ name: '   ' })), ['MODINFO_NAME_MISSING']);
  });

  test('a non-string name is MODINFO_FIELD_TYPE', () => {
    assert.deepEqual(codes(check({ name: 5 })), ['MODINFO_FIELD_TYPE']);
  });

  test('name allows 32 characters, counted as code points', () => {
    assert.deepEqual(check({ name: 'x'.repeat(32) }), []);
    assert.deepEqual(check({ name: '🚂'.repeat(32) }), []);
    assert.deepEqual(codes(check({ name: 'x'.repeat(33) })), ['MODINFO_NAME_LENGTH']);
  });

  test('a line break in name is MODINFO_NAME_LINEBREAK', () => {
    for (const name of ['Demo\nmod', 'Demo\r\nmod', 'Demo mod']) {
      assert.deepEqual(codes(check({ name })), ['MODINFO_NAME_LINEBREAK']);
    }
  });

  test('a missing summary is a MODINFO_SUMMARY_MISSING warning', () => {
    assert.equal(only(check({ summary: undefined }), 'MODINFO_SUMMARY_MISSING').severity, 'warning');
  });

  test('summary allows 100 characters on one line', () => {
    assert.deepEqual(check({ summary: 'x'.repeat(100) }), []);
    assert.deepEqual(codes(check({ summary: 'x'.repeat(101) })), ['MODINFO_SUMMARY_LENGTH']);
    assert.deepEqual(codes(check({ summary: 'One\nTwo' })), ['MODINFO_SUMMARY_LINEBREAK']);
  });
});

describe('modinfo.json: description', () => {
  test('description may span several lines', () => {
    assert.deepEqual(check({ description: 'Line one.\nLine two.' }), []);
  });

  test('description must be a string', () => {
    assert.deepEqual(codes(check({ description: ['Line'] })), ['MODINFO_FIELD_TYPE']);
  });

  test('description next to description.html is MODINFO_DESCRIPTION_IGNORED', () => {
    assert.deepEqual(codes(check({ description: 'Text' }, { hasDescriptionHtml: true })), ['MODINFO_DESCRIPTION_IGNORED']);
    assert.deepEqual(check({}, { hasDescriptionHtml: true }), []);
  });
});

describe('modinfo.json: localization', () => {
  test('localized name, summary and description are accepted', () => {
    assert.deepEqual(check({ localization: { es: { name: 'Mod demo', summary: 'Un mod.', description: 'Uno.\nDos.' } } }), []);
  });

  test('localization must be an object of objects', () => {
    assert.deepEqual(codes(check({ localization: [] })), ['MODINFO_FIELD_TYPE']);
    assert.deepEqual(codes(check({ localization: { es: 'Mod demo' } })), ['MODINFO_FIELD_TYPE']);
  });

  test('other fields are MODINFO_LOCALIZATION_UNKNOWN_FIELD warnings', () => {
    const finding = only(check({ localization: { es: { tags: ['Misc'] } } }), 'MODINFO_LOCALIZATION_UNKNOWN_FIELD');
    assert.equal(finding.pointer, '/localization/es/tags');
  });

  test('localized texts follow the same limits, without being required', () => {
    assert.deepEqual(check({ localization: { es: {} } }), []);
    const findings = check({ localization: { de: { name: 'x'.repeat(33), summary: 'a\nb', description: 1 } } });
    assert.deepEqual(
      findings.map((f) => [f.code, f.pointer]),
      [
        ['MODINFO_NAME_LENGTH', '/localization/de/name'],
        ['MODINFO_SUMMARY_LINEBREAK', '/localization/de/summary'],
        ['MODINFO_FIELD_TYPE', '/localization/de/description'],
      ],
    );
  });
});

describe('modinfo.json: authors', () => {
  test('missing or empty authors is a MODINFO_AUTHORS_MISSING warning', () => {
    assert.equal(only(check({ authors: undefined }), 'MODINFO_AUTHORS_MISSING').severity, 'warning');
    assert.deepEqual(codes(check({ authors: [] })), ['MODINFO_AUTHORS_MISSING']);
  });

  test('authors must be an array of objects with a string role', () => {
    assert.deepEqual(codes(check({ authors: 'Demo Author' })), ['MODINFO_FIELD_TYPE']);
    assert.deepEqual(codes(check({ authors: ['Demo Author'] })), ['MODINFO_FIELD_TYPE']);
    assert.deepEqual(codes(check({ authors: [{ name: 'Demo Author', role: 1 }] })), ['MODINFO_FIELD_TYPE']);
    assert.deepEqual(check({ authors: [{ name: 'Demo Author' }] }), []);
  });

  test('an author without name is MODINFO_AUTHOR_NAME_MISSING', () => {
    assert.deepEqual(codes(check({ authors: [{ role: 'Creator' }] })), ['MODINFO_AUTHOR_NAME_MISSING']);
  });
});

describe('modinfo.json: tags', () => {
  test('missing or empty tags is MODINFO_TAGS_MISSING', () => {
    assert.deepEqual(codes(check({ tags: undefined })), ['MODINFO_TAGS_MISSING']);
    assert.deepEqual(codes(check({ tags: [] })), ['MODINFO_TAGS_MISSING']);
  });

  test('tags must be an array of non-empty strings', () => {
    assert.deepEqual(codes(check({ tags: 'Misc' })), ['MODINFO_FIELD_TYPE']);
    assert.deepEqual(codes(check({ tags: ['Misc', ''] })), ['MODINFO_FIELD_TYPE']);
  });

  test('a repeated tag is a MODINFO_TAG_DUPLICATE warning', () => {
    assert.equal(only(check({ tags: ['Misc', 'Misc'] }), 'MODINFO_TAG_DUPLICATE').pointer, '/tags/1');
  });
});

describe('modinfo.json: dependencies and url', () => {
  test('mod.io ids as digit strings are accepted', () => {
    assert.deepEqual(check({ dependencies: ['1', '2058231'] }), []);
  });

  test('dependencies must be an array', () => {
    assert.deepEqual(codes(check({ dependencies: '1' })), ['MODINFO_FIELD_TYPE']);
  });

  test('a non-digit or numeric id is MODINFO_DEPENDENCY_FORMAT', () => {
    for (const id of ['abc', '012', '', '1.5', null]) {
      assert.deepEqual(codes(check({ dependencies: [id] })), ['MODINFO_DEPENDENCY_FORMAT'], `id ${JSON.stringify(id)}`);
    }
    assert.match(only(check({ dependencies: [42] }), 'MODINFO_DEPENDENCY_FORMAT').message, /"42"/);
  });

  test('a repeated id is a MODINFO_DEPENDENCY_DUPLICATE warning', () => {
    assert.deepEqual(codes(check({ dependencies: ['1', '1'] })), ['MODINFO_DEPENDENCY_DUPLICATE']);
  });

  test('url must be an absolute http or https URL', () => {
    assert.deepEqual(check({ url: 'https://example.com/mod' }), []);
    assert.deepEqual(check({ url: 'http://example.com' }), []);
    for (const url of ['example.com', 'ftp://example.com', 'javascript:alert(1)', '']) {
      assert.deepEqual(codes(check({ url })), ['MODINFO_URL_FORMAT'], `url ${url}`);
    }
    assert.deepEqual(codes(check({ url: 1 })), ['MODINFO_FIELD_TYPE']);
  });
});
