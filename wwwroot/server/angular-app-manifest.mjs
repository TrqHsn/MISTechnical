
export default {
  bootstrap: () => import('./main.server.mjs').then(m => m.default),
  inlineCriticalCss: true,
  baseHref: '/',
  locale: undefined,
  routes: [
  {
    "renderMode": 2,
    "redirectTo": "/ad-tools",
    "route": "/"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-63VSERDY.js",
      "chunk-4F4PQCC5.js"
    ],
    "route": "/ad-tools"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-Z4HUS36C.js"
    ],
    "route": "/print"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-XGBGP5ZN.js",
      "chunk-YO7VP2I6.js",
      "chunk-KRZITJRR.js",
      "chunk-5WX7N2PC.js",
      "chunk-2HNJBOR5.js"
    ],
    "route": "/forms"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-CV3L52SL.js",
      "chunk-YO7VP2I6.js",
      "chunk-2HNJBOR5.js"
    ],
    "route": "/os-installation-form"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-F4TQXPAT.js"
    ],
    "route": "/stress-cpu-gpu"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-GJETUPMM.js"
    ],
    "route": "/network"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-MVXE54NT.js"
    ],
    "route": "/network-dashboard"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-MQTCJCLW.js"
    ],
    "route": "/device-tool"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-B6TYTWZ5.js",
      "chunk-KRZITJRR.js"
    ],
    "route": "/device-assign"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-F7QESPTI.js",
      "chunk-5WX7N2PC.js",
      "chunk-2HNJBOR5.js"
    ],
    "route": "/jobsheet"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-GM2SECCG.js",
      "chunk-4F4PQCC5.js"
    ],
    "route": "/inventory"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-OEDLWO3I.js"
    ],
    "route": "/sinage"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-FF2AZDE4.js"
    ],
    "route": "/important-links"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-ZTPF74QA.js"
    ],
    "route": "/files"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-TNPSL5MH.js"
    ],
    "route": "/cam-mic-speaker"
  },
  {
    "renderMode": 2,
    "preload": [
      "chunk-SV32NZSO.js"
    ],
    "route": "/display-test"
  },
  {
    "renderMode": 2,
    "redirectTo": "/ad-tools",
    "route": "/**"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 848, hash: 'f570a4a69daad7413621fe82560c74e255f26a3bfa7f82a290094e4b7129a973', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 1361, hash: '40464ee0b77c2c674bc033d50cbe20476cc27383b25321eb48ced4e90ae8480f', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'network-dashboard/index.html': {size: 43483, hash: '666d640997fc33752c13c79cb484b88e8370ae1e0b65e5df7176e60287f79149', text: () => import('./assets-chunks/network-dashboard_index_html.mjs').then(m => m.default)},
    'ad-tools/index.html': {size: 48735, hash: 'f7ffd3ee0b022341af6834c10e6e388e91c5df3d0a1a9a8253d7e1b323f917d1', text: () => import('./assets-chunks/ad-tools_index_html.mjs').then(m => m.default)},
    'print/index.html': {size: 47626, hash: '9f8dd04e3d4a2d577a54475662c7e56c2bf5feb5fd6186204b90cfd4e81a4740', text: () => import('./assets-chunks/print_index_html.mjs').then(m => m.default)},
    'network/index.html': {size: 45263, hash: 'e8b2ef4a883ac8a578ad688354cc5b31e742a1ee67d2f57b214c9a4b6ff24b11', text: () => import('./assets-chunks/network_index_html.mjs').then(m => m.default)},
    'important-links/index.html': {size: 43602, hash: 'bfbdb20912ededc82541963cc7568a199948e2597bf8d866dfddef4d9fc81634', text: () => import('./assets-chunks/important-links_index_html.mjs').then(m => m.default)},
    'cam-mic-speaker/index.html': {size: 37246, hash: '5f7119e41bf15563ff1e8ec48ac50e3feacd8e0d1c8a7ccc09075135d90f26cc', text: () => import('./assets-chunks/cam-mic-speaker_index_html.mjs').then(m => m.default)},
    'inventory/index.html': {size: 42313, hash: 'aaef33fe7a05cf8315e5f8a5e5f08f6d46c3da81a7adf2677d6aa36e5a61bb8c', text: () => import('./assets-chunks/inventory_index_html.mjs').then(m => m.default)},
    'device-assign/index.html': {size: 48369, hash: 'f04d791bb66e17f4a33e2422757cf9e3a66e5fe37e7392359d6286ddfdcc8272', text: () => import('./assets-chunks/device-assign_index_html.mjs').then(m => m.default)},
    'stress-cpu-gpu/index.html': {size: 36396, hash: '13a291a8c277cca0411edf9049dc0943dc327b4e18376da48693dc575c5e7b57', text: () => import('./assets-chunks/stress-cpu-gpu_index_html.mjs').then(m => m.default)},
    'device-tool/index.html': {size: 37358, hash: '29583fa59374352ed17773596e21492b1cbb6d4396c9c93ff74d6319d3248fe2', text: () => import('./assets-chunks/device-tool_index_html.mjs').then(m => m.default)},
    'display-test/index.html': {size: 42173, hash: 'f1fda8bc8f30f421363aa984d28935b9aabd1678bf6b19863aa53c803f7facf7', text: () => import('./assets-chunks/display-test_index_html.mjs').then(m => m.default)},
    'sinage/index.html': {size: 66355, hash: '7203337883eac83bc3b0d9562861ac2a2bf5ff4cd4a18ff2e8f36c9fec2b2277', text: () => import('./assets-chunks/sinage_index_html.mjs').then(m => m.default)},
    'files/index.html': {size: 39580, hash: '0a7f1f816ac06d800a8424976baed6fcb45420d519968b34b75615ef33faf051', text: () => import('./assets-chunks/files_index_html.mjs').then(m => m.default)},
    'forms/index.html': {size: 48048, hash: '02418f768a4c160c41a417915bcfaecd194a258c50a1ccb2fe35225088711fc9', text: () => import('./assets-chunks/forms_index_html.mjs').then(m => m.default)},
    'jobsheet/index.html': {size: 47121, hash: '63d713adac99417eac527fabea376acbd67d80564ddefe47433c04282a1effbd', text: () => import('./assets-chunks/jobsheet_index_html.mjs').then(m => m.default)},
    'os-installation-form/index.html': {size: 45969, hash: '903ddf0e41148603f2a4a4866c15a60183b7777819a06fde72ba1602eceaf285', text: () => import('./assets-chunks/os-installation-form_index_html.mjs').then(m => m.default)},
    'styles-5INURTSO.css': {size: 0, hash: 'menYUTfbRu8', text: () => import('./assets-chunks/styles-5INURTSO_css.mjs').then(m => m.default)}
  },
};
