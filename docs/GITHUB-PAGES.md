# プロジェクト本体のGitHub Pages

対象リポジトリ：https://github.com/yyy-yuichi/bus-stop-compact-town

別の地図専用リポジトリは作らず、このプロジェクトのソースからビルドしたアプリ全体を、このリポジトリのPagesで公開する。

公開処理は `.github/workflows/pages.yml` の手動実行 `Publish project to GitHub Pages` に用意した。通常のpushでは検証・ビルドのみが実行される。

2026-09-08、ユーザーの一般公開承認を受けてリポジトリを公開へ変更し、GitHub Pagesへ配信した。

公開URL：https://yyy-yuichi.github.io/bus-stop-compact-town/

公開処理：https://github.com/yyy-yuichi/bus-stop-compact-town/actions/runs/34175170184 （成功）。公開先で19施設の読み込み、施設選択と詳細表示を確認し、ブラウザー実行エラーなし。

Sitesは利用しない。試行時に登録したSitesプロジェクトは非公開・未配信のままで、`.openai/hosting.json` はその試行の記録。現行の公開先指定はGitHub Pagesを優先する。

