// Reviewed public upstream references, never credentials. Frozen recursively.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
export const vendorResourceCatalog=freeze({
  "schemaVersion": 1,
  "id": "supabase-selfhosted-v0-8-3-resource-review-auth-realtime-20261030",
  "upstreamCommit": "bc27d2661edd09a5d0b8d76ce33da6d4071a756e",
  "baselineFiles": [
    {
      "url": "https://raw.githubusercontent.com/supabase/supabase/bc27d2661edd09a5d0b8d76ce33da6d4071a756e/docker/docker-compose.yml",
      "sha256": "1bf8df5776dd81e9be15790851b46cdca1d0be8556450d4c88d73089d3b97a8b"
    },
    {
      "url": "https://raw.githubusercontent.com/supabase/supabase/bc27d2661edd09a5d0b8d76ce33da6d4071a756e/docker/.env.example",
      "sha256": "d27fb4516702358ac5965fb06d207736abeb3c26c7d949f19b90e88b25e694ef"
    },
    {
      "url": "https://raw.githubusercontent.com/supabase/supabase/bc27d2661edd09a5d0b8d76ce33da6d4071a756e/docker/volumes/pooler/pooler.exs",
      "sha256": "d844e49f8915021ccbf6af6b769fef7909a723346bfc8f94ddb0433a328e49b1"
    }
  ],
  "entries": [
    {
      "id": "auth",
      "repository": "supabase/auth",
      "version": "v2.197.0",
      "commit": "4eee58f296d9698a1c2c0ae14d7a0b379c7622d3",
      "image": "supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b",
      "sources": [
        {
          "path": "internal/conf/configuration.go",
          "url": "https://raw.githubusercontent.com/supabase/auth/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/conf/configuration.go",
          "sha256": "b27faebba541f907b23d2ce2dcab8c4679b5ce49cf1fcee007778f1b53230773"
        },
        {
          "path": "internal/storage/dial.go",
          "url": "https://raw.githubusercontent.com/supabase/auth/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/internal/storage/dial.go",
          "sha256": "fcdee7df9849a19a37100fbba79952ecb534a9b2bb7edc1a4b21708ec3172087"
        }
      ]
    },
    {
      "id": "rest",
      "repository": "PostgREST/postgrest",
      "version": "v14.18",
      "commit": "6fafa601d13b15f9875e3a70e733ddd6f38f633e",
      "image": "postgrest/postgrest@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf",
      "sources": [
        {
          "path": "src/PostgREST/AppState.hs",
          "url": "https://raw.githubusercontent.com/PostgREST/postgrest/6fafa601d13b15f9875e3a70e733ddd6f38f633e/src/PostgREST/AppState.hs",
          "sha256": "388900c8d8eb26657ab145c4bac59d2412d9b721eaa2c8e2b69e8caaae401daf"
        },
        {
          "path": "src/PostgREST/Listener.hs",
          "url": "https://raw.githubusercontent.com/PostgREST/postgrest/6fafa601d13b15f9875e3a70e733ddd6f38f633e/src/PostgREST/Listener.hs",
          "sha256": "b64cc411156bcd55132299d661e886307a9ace860850a0426a3904bedd04ceec"
        },
        {
          "path": "docs/references/configuration.rst",
          "url": "https://raw.githubusercontent.com/PostgREST/postgrest/6fafa601d13b15f9875e3a70e733ddd6f38f633e/docs/references/configuration.rst",
          "sha256": "448a01aa39a70e02a6f844bd979eb6156cdb9f9bdf2875afe95dbde0e163e314"
        }
      ]
    },
    {
      "id": "realtime",
      "repository": "supabase/realtime",
      "version": "v2.143.3",
      "commit": "d46540b3a4a79113f40301d5e5cb690f41150b9b",
      "image": "supabase/realtime@sha256:768b559241dd234c4e8852c5c0f504e598b80f1df2ad4dd78d5486fbed2f17a2",
      "sources": [
        {
          "path": "config/runtime.exs",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/config/runtime.exs",
          "sha256": "3fca6db3868e01a56f47d2590c62299564a7915f889920303170f2e8c20c688e"
        },
        {
          "path": "run.sh",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/run.sh",
          "sha256": "e0f089b7da0e93a4f4164c240c3265b3aa44ead800a6818350b8534c689d98d5"
        },
        {
          "path": "Dockerfile",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/Dockerfile",
          "sha256": "8cc06297108b808cf83a92dfa384bd67c4f4f2b1457871afdf6aa8a4d1accb27"
        },
        {
          "path": "ENVS.md",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/ENVS.md",
          "sha256": "b94eebf19628b4cc48f880a1803ac3347713742d6f1f2657408be0e8d72d1f04"
        },
        {
          "path": "ARCHITECTURE.md",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/ARCHITECTURE.md",
          "sha256": "bd8c7ae9b9f48547f9a2042987ebd1eab97d1229168e0e76a7ed3b47701fc91f"
        },
        {
          "path": "lib/realtime/application.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/application.ex",
          "sha256": "5edfa53c9eca4c1b94ba7673dfbd7b71fc2689e7624e9d5fdd83b23b987560e8"
        },
        {
          "path": "lib/realtime/database.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/database.ex",
          "sha256": "baa0950e909a49392d67bb6a0e55602f3816f7112240e3e5c8049ff2964894b7"
        },
        {
          "path": "lib/realtime/repo.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/repo.ex",
          "sha256": "a03ace3dfaa9937cd1a4c367e9766e0d83a0800cd46fe62df80622c0e5b3043a"
        },
        {
          "path": "lib/realtime/repo_replica.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/repo_replica.ex",
          "sha256": "99550e6a3f81febb2884a91292caf4577e8e5189a62b1ae6e8abe4c0fa198f44"
        },
        {
          "path": "lib/realtime/release.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/release.ex",
          "sha256": "0bc0ea6db1039a257423a2eff79a9d9c24206e057f249de6135b5c1a2befebda"
        },
        {
          "path": "lib/realtime/tenants.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants.ex",
          "sha256": "01ac0f385efc157d0a8c56b06c8e0fb6720ff5f2eb7f89ebe87b89c414f82079"
        },
        {
          "path": "lib/realtime/tenants/connect.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/connect.ex",
          "sha256": "bef43baeb9d5fa74812f1cad196b45910c243089dafcba390ef939fdf1e28991"
        },
        {
          "path": "lib/realtime/tenants/migrations.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/migrations.ex",
          "sha256": "0ac14029e8ef5321721dfeb7e9465fcf916ee58907a297023269c8a79b186a74"
        },
        {
          "path": "lib/realtime/tenants/replication_connection.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/replication_connection.ex",
          "sha256": "8bf4a4a66683e6ae3348234d24551a6d06fef0059364335017fcb043b6236c5a"
        },
        {
          "path": "lib/realtime/tenants/janitor.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/janitor.ex",
          "sha256": "1672282f982fe1f06f01a0807c3f080297b591a73469a463ef6988169b613f41"
        },
        {
          "path": "lib/realtime/tenants/janitor/maintenance_task.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime/tenants/janitor/maintenance_task.ex",
          "sha256": "2453ed6b89a608c152c788dd004ff7d4c13ae8fa603b59bebe06a30d4118d4ca"
        },
        {
          "path": "lib/extensions/postgres_cdc_rls/db_settings.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/extensions/postgres_cdc_rls/db_settings.ex",
          "sha256": "c842dc0213c99300391b9cec7a409f8240bafa65043486fcb4d534c1fe753955"
        },
        {
          "path": "lib/extensions/postgres_cdc_rls/subscription_manager.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/extensions/postgres_cdc_rls/subscription_manager.ex",
          "sha256": "e7f36072a797b62d9e39f91523a2a6a974b14bd1c736dc522ce49af1e01b38c1"
        },
        {
          "path": "lib/extensions/postgres_cdc_rls/replication_poller.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/extensions/postgres_cdc_rls/replication_poller.ex",
          "sha256": "fa952057e46b3d6bf48aea8846ba6f144371a69e89d25d32ecaff1a7bf413d3d"
        },
        {
          "path": "lib/extensions/postgres_cdc_rls/worker_supervisor.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/extensions/postgres_cdc_rls/worker_supervisor.ex",
          "sha256": "abfbc9009add786ac6c65e808636fe9c5a95d4a130b8f1887a4d45168cc798b4"
        },
        {
          "path": "lib/realtime_web/router.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/router.ex",
          "sha256": "526287c8440e8a74d10822f8477d2cd0bb9898f9ac465411034c8d45d65b1085"
        },
        {
          "path": "lib/realtime_web/controllers/tenant_controller.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/controllers/tenant_controller.ex",
          "sha256": "c6389a78e32b70fd171b6551e3bf23bc21c50e1f631cc0ad9c46270ee12679d3"
        },
        {
          "path": "lib/realtime_web/dashboard/tenant_info.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/dashboard/tenant_info.ex",
          "sha256": "2c7028094910ed117f0bb8ba1d1cefa3f519fb48772093eef40210a85925a00b"
        },
        {
          "path": "lib/realtime_web/dashboard/tenant_migrations.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/dashboard/tenant_migrations.ex",
          "sha256": "894ae44be127c76f23cc426098e42a91bc259e4db2ca53d51de9f75e06f31121"
        },
        {
          "path": "priv/repo/seeds.exs",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/priv/repo/seeds.exs",
          "sha256": "81bddd02ad0e291524dfc65453a7cd961bf8c75d9881cd13cd28a967c2f532f6"
        },
        {
          "path": "lib/realtime_web/channels/realtime_channel.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/channels/realtime_channel.ex",
          "sha256": "d631e0feccebb445ccd3d1bc7c46699768c1ebbb976a37737658239e7f2a3bdd"
        },
        {
          "path": "lib/realtime_web/channels/realtime_channel/logging.ex",
          "url": "https://raw.githubusercontent.com/supabase/realtime/d46540b3a4a79113f40301d5e5cb690f41150b9b/lib/realtime_web/channels/realtime_channel/logging.ex",
          "sha256": "9ba746ee424e097229e37addc5696fbee583c03e5483e2a7aa58b2c1cbcb74e2"
        }
      ]
    },
    {
      "id": "storage",
      "repository": "supabase/storage",
      "version": "v1.81.0",
      "commit": "f31599e188d7c9c854b1daa76a11b41c6d179462",
      "image": "supabase/storage-api@sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54",
      "sources": [
        {
          "path": "src/config.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/config.ts",
          "sha256": "77d2f101c4daed6622a76ba570aa3857f5f6a54c5d28b899c4513db49d6c994f"
        },
        {
          "path": "src/start/server.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/start/server.ts",
          "sha256": "f68029ce9d7e24bf688dce888e78d3e1df1b4bdad86e97f754a3aee364dbfd25"
        },
        {
          "path": "src/app.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/app.ts",
          "sha256": "aafea8a470056668e0023448270d0bec8c6b0cee3c96a874a1ff18b025114673"
        },
        {
          "path": "src/internal/database/client.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/client.ts",
          "sha256": "5549caff71dbf9b53f44272c25a4c78b10c3e12e3481f723629d214f91b66371"
        },
        {
          "path": "src/internal/database/pool.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/pool.ts",
          "sha256": "e351ddd9ee69d1fd6e88b26b494e18ec551cb5f2df0ccbda73c9ab82d5551b20"
        },
        {
          "path": "src/internal/database/pg-connection.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/pg-connection.ts",
          "sha256": "8c712d053bf47ab0274f84b43090da594188ffc16fba07cada190f901e21cada"
        },
        {
          "path": "src/internal/database/multitenant-pg.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/multitenant-pg.ts",
          "sha256": "e1459293b5b92e1a129b73f51c9ad91ec6f4efc358697e3bb18e1bbdb73a2058"
        },
        {
          "path": "src/internal/database/pubsub.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/pubsub.ts",
          "sha256": "c9f87f87d0016d25f7eedb8c4328be835b8ee9fc50b943167505500547d3915f"
        },
        {
          "path": "src/internal/database/migrations/migrate.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/database/migrations/migrate.ts",
          "sha256": "f9e1e598def79e01391934ca0c75b0761aece927e832be71e036c5490beb5c4a"
        },
        {
          "path": "src/internal/pubsub/postgres.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/pubsub/postgres.ts",
          "sha256": "a2aa80a90ef6d14a540b209f94237526903f7b2864c7c68efcc39ea16251747f"
        },
        {
          "path": "src/internal/queue/queue.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/queue/queue.ts",
          "sha256": "b4e1e337970ff58154c739e44017d40f8c4d5646da12b3ef2a4208be14bc3adb"
        },
        {
          "path": "src/internal/queue/database.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/queue/database.ts",
          "sha256": "c2a01568f3bb38cd9df9e292098e7fe8dfa26994c32e67e2a8cec053091366ea"
        },
        {
          "path": "src/http/plugins/tenant-id.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/http/plugins/tenant-id.ts",
          "sha256": "f31e95c6865553b91a8f6421175cef0607515f553887b975c9ae1ad54c9f08c5"
        },
        {
          "path": "src/http/plugins/db.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/http/plugins/db.ts",
          "sha256": "0ab87e5e7538956fa4b2766a567744f1115659964b0379a833e3f8ef50638f90"
        },
        {
          "path": "src/http/plugins/vector.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/http/plugins/vector.ts",
          "sha256": "1b3ba60ecedb11041d6e7709f3c3d65d4c2f52771b26b96b7bc3f677d52bbbc4"
        },
        {
          "path": "src/http/plugins/iceberg.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/http/plugins/iceberg.ts",
          "sha256": "f6d49c3e39eab204f3dd3ed2eff418f280f938cc6c58a8bb0a8fd6f46635c855"
        },
        {
          "path": "src/internal/cluster/cluster.ts",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/src/internal/cluster/cluster.ts",
          "sha256": "ea814875a17190925399c41cf14f36f09ecf908e81336c87401ec785e3a9ced0"
        },
        {
          "path": "Dockerfile",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/Dockerfile",
          "sha256": "041cceef935c0e743f78edc1e7d7a3f1a56ef82893575719b2d831728e0cad08"
        },
        {
          "path": "package-lock.json",
          "url": "https://raw.githubusercontent.com/supabase/storage/f31599e188d7c9c854b1daa76a11b41c6d179462/package-lock.json",
          "sha256": "d293e4fddf1dbc8507f2e0e7efe5db3ae3b423fa7e0211e08d769af3f378c678"
        }
      ]
    },
    {
      "id": "meta",
      "repository": "supabase/postgres-meta",
      "version": "v0.100.0",
      "commit": "9a2effd147f2f028fa36553ec2c7eeec80d7f8fc",
      "image": null,
      "sources": [
        {
          "path": "src/server/constants.ts",
          "url": "https://raw.githubusercontent.com/supabase/postgres-meta/9a2effd147f2f028fa36553ec2c7eeec80d7f8fc/src/server/constants.ts",
          "sha256": "b999771c7f0fadc45584e73a85e325ff8748bd3289e7b7f3ab058646f0de65fa"
        },
        {
          "path": "src/server/routes/tables.ts",
          "url": "https://raw.githubusercontent.com/supabase/postgres-meta/9a2effd147f2f028fa36553ec2c7eeec80d7f8fc/src/server/routes/tables.ts",
          "sha256": "b5c2acdd3a97e70493aa6a91f7274ad67e69428dab0fc1a1eaa05c50c67c91d4"
        },
        {
          "path": "src/server/routes/query.ts",
          "url": "https://raw.githubusercontent.com/supabase/postgres-meta/9a2effd147f2f028fa36553ec2c7eeec80d7f8fc/src/server/routes/query.ts",
          "sha256": "8f3746eff97bb8507d8be06ccbcbbb0bf5a484b75eaf21f11b4fb6a733b76a68"
        }
      ]
    },
    {
      "id": "supavisor",
      "repository": "supabase/supavisor",
      "version": "v2.9.13",
      "commit": "5a51fbfadaa6d6286c1fee0a95d4c629e81a2750",
      "image": null,
      "sources": [
        {
          "path": "config/runtime.exs",
          "url": "https://raw.githubusercontent.com/supabase/supavisor/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/config/runtime.exs",
          "sha256": "9fb7cded3a446b7192e5dce4a27acd1f1b49c4a703f858361c48811235f0b60e"
        },
        {
          "path": "lib/supavisor/tenant_supervisor.ex",
          "url": "https://raw.githubusercontent.com/supabase/supavisor/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/tenant_supervisor.ex",
          "sha256": "b363da2941adf87453dd4c162b5bc2d56af904f35fa4e0180d48447f75de479b"
        },
        {
          "path": "lib/supavisor/helpers.ex",
          "url": "https://raw.githubusercontent.com/supabase/supavisor/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/helpers.ex",
          "sha256": "c8ab99dc12ff0431ffcf3a4fc443d3540b00faa43053fd4a7afa829d9301b250"
        },
        {
          "path": "lib/supavisor/manager.ex",
          "url": "https://raw.githubusercontent.com/supabase/supavisor/5a51fbfadaa6d6286c1fee0a95d4c629e81a2750/lib/supavisor/manager.ex",
          "sha256": "723636ae6052d755942ad20bcc3bb9a68008acf2ef6b97bef400aefaa400c84e"
        }
      ]
    },
    {
      "id": "functions",
      "repository": "supabase/edge-runtime",
      "version": "v1.77.4",
      "commit": "d4a4f606a90e8c66864219c9b1d31ef0e3e3f626",
      "image": null,
      "sources": [
        {
          "path": "README.md",
          "url": "https://raw.githubusercontent.com/supabase/edge-runtime/d4a4f606a90e8c66864219c9b1d31ef0e3e3f626/README.md",
          "sha256": "83bde38971f40b7bd72b19255d67a67c4bb34187273f712f05e9a4f94135c561"
        },
        {
          "path": "crates/base/src/worker/pool.rs",
          "url": "https://raw.githubusercontent.com/supabase/edge-runtime/d4a4f606a90e8c66864219c9b1d31ef0e3e3f626/crates/base/src/worker/pool.rs",
          "sha256": "9bd79213f25d50c875e368903b7495332f6b79d21fba5d4baf008cf8d1cab66a"
        }
      ]
    }
  ],
  "managedAuth": {
    "id": "roomqc-password-guard-v1",
    "image": "roomqc/gotrue@sha256:5501a98d4819812bca0acdf2a28677bf5779ae4e34ab2e11f021320b8e5da7c8",
    "upstreamCommit": "4eee58f296d9698a1c2c0ae14d7a0b379c7622d3",
    "sourceHash": "2265e0d8f85292e6a891a5a098b2d99665133b746a483b671ec1ea614c203362",
    "binarySha256": "9f6501e192deac775cebfd5ff2d1781ba11d95190bc428ea53bdc9b8c128f2d1",
    "platform": "linux/amd64",
    "evidence": "artifacts/roomqc-full-and-rebuild-2026-10-30.json"
  },
  "sourceToImageProvenanceVerified": false,
  "notes": [
    "Auth/PostgREST/Storage image digests match retained local registry image inventory. This is not independent source-to-image reproducibility or signed publisher attestation.",
    "The additional RoomQC Auth recipe is restricted to the exact locally tested image digest and password/audit guards. It preserves the upstream database pool path. Full/rebuild evidence predates this catalog update; no installed runtime or whole-stack capacity is certified by this PLAN recipe.",
    "Storage recipe is fixed-project Node file storage only, with main pool, pubsub and conservative startup migration allocation. Network/reconnect/server-retirement overlap is not a hard session ceiling. Other services remain unresolved."
  ]
});
