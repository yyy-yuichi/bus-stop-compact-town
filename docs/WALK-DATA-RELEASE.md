# 徒歩圏データの再ベイクとRelease更新

`work/walk/`（3,657件のベイク済み徒歩圏カタログ、150MB弱）はgitに置かない。再ベイクのたびに全ファイルが書き換わり、gitは差分を持てず、JSONの圧縮効率も悪いため、コミットのたびにリポジトリが150MB前後太る。配布はGitHub Releaseアセット（tar.gzで約35MB、2GB上限を大きく下回る）で行う。gitに置くのは`public/data/walk-release.json`（tag・asset・sha256・count）だけ。

## 再ベイクしてReleaseへ反映する手順

1. **ベイクする**（既存の手順のまま）
   ```sh
   python3 scripts/bake-walking.py
   ```
   `work/walk/`が更新される。

2. **パッケージ化する**
   ```sh
   npm run data:package
   ```
   `work/walk-data-<日付>.tar.gz`を作り、SHA-256・件数・`walk-release.json`に貼り付けるJSONを表示する。**アップロードはしない。**

3. **Releaseを作る**
   ```sh
   DATE=$(date +%Y%m%d)
   gh release create "walk-data-$DATE" \
     "work/walk-data-$DATE.tar.gz" \
     --title "徒歩圏データ $DATE" \
     --notes "OSM(ODbL 1.0)と国土地理院標高タイルから生成した、山口県内バス停の徒歩圏データ。"
   ```

4. **マニフェストを更新する**

   `public/data/walk-release.json`をStep 2の出力（`asset`・`sha256`・`count`）とStep 3で付けた`tag`で書き換える。**`sha256`と`count`は、実際にアップロードしたtarballの値と一致していること。**ここが食い違うと、`npm run data:fetch`はチェックサム不一致で止まるか、`node scripts/verify-release.mjs`が件数不一致でビルドを落とす。

5. **コミットする**
   ```sh
   git add public/data/walk-release.json
   git commit -m "Update baked walking catchments Release"
   ```

CIは`npm run build`の直前に`npm run data:fetch`を実行し、更新後のマニフェストを見て新しいアセットを取得する。

## ローカルでの取得

```sh
npm run data:fetch
```

`public/data/walk/index.json`の件数がマニフェストの`count`と一致していれば、ダウンロードせずに終了する。`public/data/walk`がシンボリックリンク（ローカルでベイクした`work/walk/`を指す、通常の開発時の配線）で、件数がマニフェストと食い違う場合は、ローカルのベイクを取得で上書きしないよう拒否する。公開版を取得したい場合はリンクを外すかリンク先を空にしてから実行する。

フォークなど別リポジトリで使う場合は`WALK_DATA_REPO`環境変数でRelease取得先を上書きできる（既定値は`yyy-yuichi/bus-stop-compact-town`）。
