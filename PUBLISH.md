# Publishing to npm

## Pre-Publish Checklist

### 1. Update package.json
- [ ] Add your name/email to `"author"` field (or remove if you prefer)
- [ ] Add repository URL to `"repository.url"` if you have a git repo
- [ ] Verify version number (currently `0.1.0`)

### 2. Verify Build
```bash
npm run build
npm test
```

### 3. Check What Will Be Published
```bash
npm pack --dry-run
```

This shows exactly what files will be included in the package.

### 4. Login to npm
```bash
npm login
```

You'll need:
- Your npm username
- Your password (or use `npm login --auth-type=legacy` if you have 2FA)
- Your email

If you don't have an npm account, create one at https://www.npmjs.com/signup

### 5. Check Package Name Availability
```bash
npm view sloppy-parser-js
```

If it says "404 Not Found", the name is available! If it shows package info, the name is taken.

### 6. Publish!
```bash
npm publish
```

For first publish, this will publish `sloppy-parser-js@0.1.0`.

### 7. Verify Publication
```bash
npm view sloppy-parser-js
```

You should see your package info!

## Publishing Updates

For future versions:

1. Update version in `package.json`:
   ```bash
   npm version patch  # 0.1.0 -> 0.1.1
   npm version minor  # 0.1.0 -> 0.2.0
   npm version major  # 0.1.0 -> 1.0.0
   ```

2. Build and publish:
   ```bash
   npm run build
   npm publish
   ```

## Scoped Packages (Optional)

If `sloppy-parser-js` is taken, you can publish as a scoped package:

1. Change name in package.json:
   ```json
   "name": "@yourusername/sloppy-parser-js"
   ```

2. Publish with:
   ```bash
   npm publish --access public
   ```

## Troubleshooting

### "You do not have permission"
- Make sure you're logged in: `npm whoami`
- Check if the package name is taken by someone else

### "Package name already exists"
- Try a different name or use scoped package

### Build fails
- Run `npm run build` manually first
- Check for TypeScript errors

---

**Ready to publish?** Just run `npm publish` after logging in!

