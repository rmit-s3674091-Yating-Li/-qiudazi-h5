# -qiudazi-h5
qiudazi-test

## Deployment source workflow

The deployable source is stored in `bundle/chunk00.txt` through
`bundle/chunk08.txt`. Run `npm run restore` before editing, then run
`npm run pack` after verified source changes so CloudBase and Vercel restore the
same files during their builds.
