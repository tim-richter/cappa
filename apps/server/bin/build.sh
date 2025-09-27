rm -rf dist public

pnpm -C ../web build

pnpm build:ts

cp -r ../web/dist public
rm -rf public/images # Remove example images