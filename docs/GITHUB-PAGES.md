# プロジェクト本体のGitHub Pages

対象リポジトリ：https://github.com/yyy-yuichi/bus-stop-compact-town

別の地図専用リポジトリは作らず、このプロジェクトのソースからビルドしたアプリ全体を、このリポジトリのPagesで公開する。

公開処理は `.github/workflows/pages.yml` の手動実行 `Publish project to GitHub Pages` に用意した。通常のpushでは検証・ビルドのみが実行される。

2026-09-08時点ではリポジトリは非公開。GitHub Pages設定APIが「現在のプランではこのリポジトリのPagesをサポートしない」と応答し、Pagesは未作成・未公開。

進め方は、リポジトリを公開へ変更するか、非公開リポジトリでPagesを利用できるGitHubプランへ変更すること。リポジトリの公開化はWebアプリだけでなく、ソース・README・調査資料・コミット履歴も外部から閲覧可能にするため、ユーザーの明示承認後に実施する。

利用可能になったらPagesのビルド方式をGitHub Actionsに設定し、このworkflowを実行。返されたPages URLと成功状態を確認して共有する。

Sitesは利用しない。試行時に登録したSitesプロジェクトは非公開・未配信のままで、`.openai/hosting.json` はその試行の記録。現行の公開先指定はGitHub Pagesを優先する。
