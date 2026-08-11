# UI test cases

All automated UI test cases live in this directory.

## Required workflow

- Add or update test cases whenever UI behavior, navigation, validation,
  localization, theme behavior, permissions, or user-visible state changes.
- Keep each test focused on observable behavior rather than implementation
  details.
- Name files `<feature>.test.tsx`.
- Reuse `test/setup.ts` for shared browser setup.
- Never delete a failing test only to make a build pass. Update the test when
  the approved behavior changed, or fix the regression when it did not.

Run locally with:

```bash
npm run test
npm run test:watch
```

`npm run build` executes the full automated test suite before compiling the
production bundle.
