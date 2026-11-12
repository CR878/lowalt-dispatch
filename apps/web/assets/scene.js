/*!
 * scene.js —— 应急低空配送调度控制台的数据资源脚本（经典脚本，非 ES module）
 *
 * 角色：本文件是 apps/web/index.html 的唯一数据来源，只挂载两个全局：
 *   window.LOWALT_SCENE_DATA  只读数据（单一 JSON 字面量赋值 + 深层冻结）
 *   window.LOWALT_SCENE_API   只读查询 API（14 个函数 + 2 个常量）
 *
 * 数据性质：全部数据 is_simulated = true；验证边界为 SITL 软件在环仿真，无实机飞行。
 * 几何来源：scenarios/v0/landing_sites.geojson、zones.geojson、obstacles.geojson
 *           （仓库内为 draft 草稿几何，本文件逐字段原样内联，未改精度、未改要素顺序）。
 * 业务数值来源：eval/scenarios/v0.yaml 的任务起终点/载荷/时限；剖面按 C-MARGIN-INVARIANT@1
 *           的公式离线生成，可复算。
 * 建筑高度：源草稿几何的 properties 没有高度字段，故按契约公式由要素序号派生：
 *           height_m = 36 + ((index * 37) % 11) * 6.5，height_source = "demo_derived"。
 *           图例须声明“建筑高度为演示构造值（源草稿几何无高度字段）”。
 *
 * 坐标基准声明（C-CRS@1 原文）：
 *   局部 ENU 米制 → WGS84 的等距圆柱近似，仅用于演示渲染。非测量级转换，几何为自建虚拟城区，
 *   不对应任何真实地点。
 *
 * 维护约束：
 *   - 数据块是单一合法 JSON 字面量，块内不得有注释/函数/单引号/尾逗号/NaN/Infinity；
 *     所有说明性注释只能写在数据块之外（本段与 API 段）。
 *   - 渲染逻辑一律不进本文件；本文件只提供数据与坐标/插值查询。
 */

window.LOWALT_SCENE_DATA = {
  "schema_version": "0.1.0",
  "crs": {
    "frame": "enu_m",
    "origin_lat_deg": 31.2304,
    "origin_lon_deg": 121.4737,
    "meters_per_deg_lat": 111320,
    "meters_per_deg_lon": 95188.9,
    "approximation": "equirectangular_demo",
    "is_demo_approximation": true,
    "disclaimer": "局部 ENU 米制 → WGS84 的等距圆柱近似，仅用于演示渲染。非测量级转换，几何为自建虚拟城区，不对应任何真实地点。",
    "coverage": {
      "min_x_m": 0,
      "max_x_m": 3000,
      "min_y_m": 0,
      "max_y_m": 3000,
      "center_lnglat": [
        121.489458,
        31.243875
      ]
    }
  },
  "geojson": {
    "landing_sites": {
      "type": "FeatureCollection",
      "crs_note": "局部 ENU 米制坐标（x 向东，y 向北，原点待定），不是经纬度。转 WGS84 前不得用于地图渲染。",
      "status": "draft",
      "note": "草稿几何：参考实现生成，B 必须按设计意图复核或重画",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [
              700,
              700
            ]
          },
          "properties": {
            "id": "L1",
            "kind": "landing_site",
            "radius_m": 30,
            "compatible_vehicle_types": [
              "placeholder"
            ],
            "occupied": false,
            "available_from": null,
            "available_until": null,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "起点侧后方，方便短程任务就近退出"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [
              1900,
              1900
            ]
          },
          "properties": {
            "id": "L2",
            "kind": "landing_site",
            "radius_m": 30,
            "compatible_vehicle_types": [
              "placeholder"
            ],
            "occupied": false,
            "available_from": null,
            "available_until": null,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "城区中部，唯一真正的中段备降点——没有它备降约束就形同虚设"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [
              2700,
              700
            ]
          },
          "properties": {
            "id": "L3",
            "kind": "landing_site",
            "radius_m": 30,
            "compatible_vehicle_types": [
              "placeholder"
            ],
            "occupied": false,
            "available_from": null,
            "available_until": null,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "右下角，覆盖东南向航段"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [
              700,
              2700
            ]
          },
          "properties": {
            "id": "L4",
            "kind": "landing_site",
            "radius_m": 30,
            "compatible_vehicle_types": [
              "placeholder"
            ],
            "occupied": false,
            "available_from": null,
            "available_until": null,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "左上角，覆盖西北向航段"
          }
        }
      ]
    },
    "zones": {
      "type": "FeatureCollection",
      "crs_note": "局部 ENU 米制坐标（x 向东，y 向北，原点待定），不是经纬度。转 WGS84 前不得用于地图渲染。",
      "status": "draft",
      "note": "草稿几何：参考实现生成，B 必须按设计意图复核或重画",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1300,
                  1300
                ],
                [
                  1700,
                  1300
                ],
                [
                  1700,
                  1700
                ],
                [
                  1300,
                  1700
                ],
                [
                  1300,
                  1300
                ]
              ]
            ]
          },
          "properties": {
            "id": "R01",
            "kind": "restriction_zone",
            "alt_min_m": 0,
            "alt_max_m": 120,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "压在 S2-01 的对角线 y=x 与 S2-04 的横向航线 y=1500 的交点 (1500,1500) 上。旧位置 (1000,1200)-(1400,1700) 只与对角线擦角，会导致基线\u0027刚好擦过\u0027而不是真穿越——那样校验器的结论就变成可有可无的巧合，而不是演示核心机制。"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1600,
                  700
                ],
                [
                  2000,
                  700
                ],
                [
                  2000,
                  1100
                ],
                [
                  1600,
                  1100
                ],
                [
                  1600,
                  700
                ]
              ]
            ]
          },
          "properties": {
            "id": "R02",
            "kind": "restriction_zone",
            "alt_min_m": 0,
            "alt_max_m": 120,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "压在中部横向走廊；S2-02/S2-05 直线必穿"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  900,
                  1800
                ],
                [
                  1300,
                  1800
                ],
                [
                  1300,
                  2200
                ],
                [
                  900,
                  2200
                ],
                [
                  900,
                  1800
                ]
              ]
            ]
          },
          "properties": {
            "id": "R03",
            "kind": "restriction_zone",
            "alt_min_m": 0,
            "alt_max_m": 120,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "压在另一条斜向走廊；给 S2-01/S3-03 一条要绕的路"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2445,
                  2445
                ],
                [
                  2555,
                  2445
                ],
                [
                  2555,
                  2555
                ],
                [
                  2445,
                  2555
                ],
                [
                  2445,
                  2445
                ]
              ]
            ]
          },
          "properties": {
            "id": "R04",
            "kind": "restriction_zone",
            "alt_min_m": 0,
            "alt_max_m": 120,
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "盖住 S4-04 目的地 (2500,2500)，验证\u0027目的地被禁=不可行\u0027；故意收小以免碰 S3-03/S4-01 终点（各距 64m）"
          }
        }
      ]
    },
    "obstacles": {
      "type": "FeatureCollection",
      "crs_note": "局部 ENU 米制坐标（x 向东，y 向北，原点待定），不是经纬度。转 WGS84 前不得用于地图渲染。",
      "status": "draft",
      "note": "草稿几何：参考实现生成，B 必须按设计意图复核或重画",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  705.8393528067992,
                  912.1862267962116
                ],
                [
                  914.2921708971651,
                  912.1862267962116
                ],
                [
                  914.2921708971651,
                  1056.2547584839135
                ],
                [
                  705.8393528067992,
                  1056.2547584839135
                ],
                [
                  705.8393528067992,
                  912.1862267962116
                ]
              ]
            ]
          },
          "properties": {
            "id": "B01",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1854.1643270532488,
                  1231.8199554170174
                ],
                [
                  2010.687982421406,
                  1231.8199554170174
                ],
                [
                  2010.687982421406,
                  1387.669234369773
                ],
                [
                  1854.1643270532488,
                  1387.669234369773
                ],
                [
                  1854.1643270532488,
                  1231.8199554170174
                ]
              ]
            ]
          },
          "properties": {
            "id": "B02",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2416.3398951615413,
                  812.6122542838694
                ],
                [
                  2586.537275409486,
                  812.6122542838694
                ],
                [
                  2586.537275409486,
                  997.2993899211484
                ],
                [
                  2416.3398951615413,
                  997.2993899211484
                ],
                [
                  2416.3398951615413,
                  812.6122542838694
                ]
              ]
            ]
          },
          "properties": {
            "id": "B03",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2073.9752564303326,
                  1184.9892176915132
                ],
                [
                  2278.8467753272275,
                  1184.9892176915132
                ],
                [
                  2278.8467753272275,
                  1297.024428431826
                ],
                [
                  2073.9752564303326,
                  1297.024428431826
                ],
                [
                  2073.9752564303326,
                  1184.9892176915132
                ]
              ]
            ]
          },
          "properties": {
            "id": "B04",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1886.0374292344063,
                  2254.382405664296
                ],
                [
                  2058.6660686714445,
                  2254.382405664296
                ],
                [
                  2058.6660686714445,
                  2404.3452141380185
                ],
                [
                  1886.0374292344063,
                  2404.3452141380185
                ],
                [
                  1886.0374292344063,
                  2254.382405664296
                ]
              ]
            ]
          },
          "properties": {
            "id": "B05",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2224.4334948297287,
                  1772.0220788227505
                ],
                [
                  2360.7856085945855,
                  1772.0220788227505
                ],
                [
                  2360.7856085945855,
                  1923.8300129451056
                ],
                [
                  2224.4334948297287,
                  1923.8300129451056
                ],
                [
                  2224.4334948297287,
                  1772.0220788227505
                ]
              ]
            ]
          },
          "properties": {
            "id": "B06",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  840.6216955208833,
                  2483.577541074151
                ],
                [
                  1025.4849076032606,
                  2483.577541074151
                ],
                [
                  1025.4849076032606,
                  2616.555745608421
                ],
                [
                  840.6216955208833,
                  2616.555745608421
                ],
                [
                  840.6216955208833,
                  2483.577541074151
                ]
              ]
            ]
          },
          "properties": {
            "id": "B07",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2647.1238870928396,
                  1178.4639430685568
                ],
                [
                  2755.1951853238993,
                  1178.4639430685568
                ],
                [
                  2755.1951853238993,
                  1269.5964801242324
                ],
                [
                  2647.1238870928396,
                  1269.5964801242324
                ],
                [
                  2647.1238870928396,
                  1178.4639430685568
                ]
              ]
            ]
          },
          "properties": {
            "id": "B08",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1810.7984759826859,
                  256.12933469851754
                ],
                [
                  1913.2025851484423,
                  256.12933469851754
                ],
                [
                  1913.2025851484423,
                  440.52681226696893
                ],
                [
                  1810.7984759826859,
                  440.52681226696893
                ],
                [
                  1810.7984759826859,
                  256.12933469851754
                ]
              ]
            ]
          },
          "properties": {
            "id": "B09",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1585.0538650081523,
                  2174.2214356811924
                ],
                [
                  1675.5602701051491,
                  2174.2214356811924
                ],
                [
                  1675.5602701051491,
                  2352.9635151688935
                ],
                [
                  1585.0538650081523,
                  2352.9635151688935
                ],
                [
                  1585.0538650081523,
                  2174.2214356811924
                ]
              ]
            ]
          },
          "properties": {
            "id": "B10",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1322.1375581912027,
                  2445.2744333717656
                ],
                [
                  1475.5086652915872,
                  2445.2744333717656
                ],
                [
                  1475.5086652915872,
                  2579.550814606506
                ],
                [
                  1322.1375581912027,
                  2579.550814606506
                ],
                [
                  1322.1375581912027,
                  2445.2744333717656
                ]
              ]
            ]
          },
          "properties": {
            "id": "B11",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  727.000245312231,
                  1231.198748171359
                ],
                [
                  902.3943614272899,
                  1231.198748171359
                ],
                [
                  902.3943614272899,
                  1410.5962387863567
                ],
                [
                  727.000245312231,
                  1410.5962387863567
                ],
                [
                  727.000245312231,
                  1231.198748171359
                ]
              ]
            ]
          },
          "properties": {
            "id": "B12",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  978.2073902396286,
                  679.5025313755963
                ],
                [
                  1141.694006574116,
                  679.5025313755963
                ],
                [
                  1141.694006574116,
                  798.106403454063
                ],
                [
                  978.2073902396286,
                  798.106403454063
                ],
                [
                  978.2073902396286,
                  679.5025313755963
                ]
              ]
            ]
          },
          "properties": {
            "id": "B13",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  405.4612151562484,
                  1989.852313157063
                ],
                [
                  519.6343995338572,
                  1989.852313157063
                ],
                [
                  519.6343995338572,
                  2158.687613327794
                ],
                [
                  405.4612151562484,
                  2158.687613327794
                ],
                [
                  405.4612151562484,
                  1989.852313157063
                ]
              ]
            ]
          },
          "properties": {
            "id": "B14",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1717.3150611562744,
                  2712.9431956865633
                ],
                [
                  1839.9643255247179,
                  2712.9431956865633
                ],
                [
                  1839.9643255247179,
                  2810.995871095533
                ],
                [
                  1717.3150611562744,
                  2810.995871095533
                ],
                [
                  1717.3150611562744,
                  2712.9431956865633
                ]
              ]
            ]
          },
          "properties": {
            "id": "B15",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  198.0740599475357,
                  889.90537863155
                ],
                [
                  351.6024937274718,
                  889.90537863155
                ],
                [
                  351.6024937274718,
                  1022.0180740553124
                ],
                [
                  198.0740599475357,
                  1022.0180740553124
                ],
                [
                  198.0740599475357,
                  889.90537863155
                ]
              ]
            ]
          },
          "properties": {
            "id": "B16",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  2368.370952577415,
                  2093.0268788563358
                ],
                [
                  2511.5169400065456,
                  2093.0268788563358
                ],
                [
                  2511.5169400065456,
                  2269.1715436172776
                ],
                [
                  2368.370952577415,
                  2269.1715436172776
                ],
                [
                  2368.370952577415,
                  2093.0268788563358
                ]
              ]
            ]
          },
          "properties": {
            "id": "B17",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1674.389665790025,
                  1868.1041100255843
                ],
                [
                  1770.0893552018438,
                  1868.1041100255843
                ],
                [
                  1770.0893552018438,
                  2042.9038907933364
                ],
                [
                  1674.389665790025,
                  2042.9038907933364
                ],
                [
                  1674.389665790025,
                  1868.1041100255843
                ]
              ]
            ]
          },
          "properties": {
            "id": "B18",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  418.8447216926137,
                  784.264070920201
                ],
                [
                  579.0073668424764,
                  784.264070920201
                ],
                [
                  579.0073668424764,
                  885.7076621069148
                ],
                [
                  418.8447216926137,
                  885.7076621069148
                ],
                [
                  418.8447216926137,
                  784.264070920201
                ]
              ]
            ]
          },
          "properties": {
            "id": "B19",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        },
        {
          "type": "Feature",
          "geometry": {
            "type": "Polygon",
            "coordinates": [
              [
                [
                  1330.446471207455,
                  463.625395790551
                ],
                [
                  1539.4762061043793,
                  463.625395790551
                ],
                [
                  1539.4762061043793,
                  634.8661112271278
                ],
                [
                  1330.446471207455,
                  634.8661112271278
                ],
                [
                  1330.446471207455,
                  463.625395790551
                ]
              ]
            ]
          },
          "properties": {
            "id": "B20",
            "kind": "building",
            "is_simulated": true,
            "status": "draft",
            "source": "自建虚拟城区 v0",
            "design_intent": "提供需避让几何，使 A* 不能走直线"
          }
        }
      ]
    }
  },
  "sites": [
    {
      "site_id": "L1",
      "kind": "landing_site",
      "x_m": 700,
      "y_m": 700,
      "lnglat": [
        121.48105379860466,
        31.236688178224938
      ],
      "position": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 700,
        "y_m": 700
      },
      "radius_m": 30,
      "compatible_vehicle_types": [
        "placeholder"
      ],
      "occupied": false,
      "available_from": null,
      "available_until": null,
      "is_simulated": true,
      "source": "自建虚拟城区 v0",
      "status": "available"
    },
    {
      "site_id": "L2",
      "kind": "landing_site",
      "x_m": 1900,
      "y_m": 1900,
      "lnglat": [
        121.49366031049838,
        31.24746791232483
      ],
      "position": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 1900,
        "y_m": 1900
      },
      "radius_m": 30,
      "compatible_vehicle_types": [
        "placeholder"
      ],
      "occupied": false,
      "available_from": null,
      "available_until": null,
      "is_simulated": true,
      "source": "自建虚拟城区 v0",
      "status": "available"
    },
    {
      "site_id": "L3",
      "kind": "landing_site",
      "x_m": 2700,
      "y_m": 700,
      "lnglat": [
        121.50206465176086,
        31.236688178224938
      ],
      "position": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 2700,
        "y_m": 700
      },
      "radius_m": 30,
      "compatible_vehicle_types": [
        "placeholder"
      ],
      "occupied": false,
      "available_from": null,
      "available_until": null,
      "is_simulated": true,
      "source": "自建虚拟城区 v0",
      "status": "available"
    },
    {
      "site_id": "L4",
      "kind": "landing_site",
      "x_m": 700,
      "y_m": 2700,
      "lnglat": [
        121.48105379860466,
        31.254654401724757
      ],
      "position": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 700,
        "y_m": 2700
      },
      "radius_m": 30,
      "compatible_vehicle_types": [
        "placeholder"
      ],
      "occupied": false,
      "available_from": null,
      "available_until": null,
      "is_simulated": true,
      "source": "自建虚拟城区 v0",
      "status": "available"
    }
  ],
  "zones": [
    {
      "zone_id": "R01",
      "kind": "restriction_zone",
      "polygon_enu": [
        [
          1300,
          1300
        ],
        [
          1700,
          1300
        ],
        [
          1700,
          1700
        ],
        [
          1300,
          1700
        ],
        [
          1300,
          1300
        ]
      ],
      "polygon_lnglat": [
        [
          121.48735705455152,
          31.242078045274884
        ],
        [
          121.49155922518277,
          31.242078045274884
        ],
        [
          121.49155922518277,
          31.245671289974847
        ],
        [
          121.48735705455152,
          31.245671289974847
        ],
        [
          121.48735705455152,
          31.242078045274884
        ]
      ],
      "alt_min_m": 0,
      "alt_max_m": 120,
      "centroid_lnglat": [
        121.48945813986714,
        31.243874667624866
      ],
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "zone_id": "R02",
      "kind": "restriction_zone",
      "polygon_enu": [
        [
          1600,
          700
        ],
        [
          2000,
          700
        ],
        [
          2000,
          1100
        ],
        [
          1600,
          1100
        ],
        [
          1600,
          700
        ]
      ],
      "polygon_lnglat": [
        [
          121.49050868252495,
          31.236688178224938
        ],
        [
          121.49471085315619,
          31.236688178224938
        ],
        [
          121.49471085315619,
          31.2402814229249
        ],
        [
          121.49050868252495,
          31.2402814229249
        ],
        [
          121.49050868252495,
          31.236688178224938
        ]
      ],
      "alt_min_m": 0,
      "alt_max_m": 120,
      "centroid_lnglat": [
        121.49260976784058,
        31.23848480057492
      ],
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "zone_id": "R03",
      "kind": "restriction_zone",
      "polygon_enu": [
        [
          900,
          1800
        ],
        [
          1300,
          1800
        ],
        [
          1300,
          2200
        ],
        [
          900,
          2200
        ],
        [
          900,
          1800
        ]
      ],
      "polygon_lnglat": [
        [
          121.48315488392028,
          31.246569601149837
        ],
        [
          121.48735705455152,
          31.246569601149837
        ],
        [
          121.48735705455152,
          31.2501628458498
        ],
        [
          121.48315488392028,
          31.2501628458498
        ],
        [
          121.48315488392028,
          31.246569601149837
        ]
      ],
      "alt_min_m": 0,
      "alt_max_m": 120,
      "centroid_lnglat": [
        121.48525596923591,
        31.24836622349982
      ],
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "zone_id": "R04",
      "kind": "restriction_zone",
      "polygon_enu": [
        [
          2445,
          2445
        ],
        [
          2555,
          2445
        ],
        [
          2555,
          2555
        ],
        [
          2445,
          2555
        ],
        [
          2445,
          2445
        ]
      ],
      "polygon_lnglat": [
        [
          121.49938576798344,
          31.25236370822853
        ],
        [
          121.50054136490704,
          31.25236370822853
        ],
        [
          121.50054136490704,
          31.25335185052102
        ],
        [
          121.49938576798344,
          31.25335185052102
        ],
        [
          121.49938576798344,
          31.25236370822853
        ]
      ],
      "alt_min_m": 0,
      "alt_max_m": 120,
      "centroid_lnglat": [
        121.49996356644525,
        31.252857779374775
      ],
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    }
  ],
  "obstacles": [
    {
      "obstacle_id": "B01",
      "kind": "building",
      "polygon_enu": [
        [
          705.8393528067992,
          912.1862267962116
        ],
        [
          914.2921708971651,
          912.1862267962116
        ],
        [
          914.2921708971651,
          1056.2547584839135
        ],
        [
          705.8393528067992,
          1056.2547584839135
        ],
        [
          705.8393528067992,
          912.1862267962116
        ]
      ],
      "polygon_lnglat": [
        [
          121.48111514349684,
          31.23859427081204
        ],
        [
          121.48330502927229,
          31.23859427081204
        ],
        [
          121.48330502927229,
          31.239888454531833
        ],
        [
          121.48111514349684,
          31.239888454531833
        ],
        [
          121.48111514349684,
          31.23859427081204
        ]
      ],
      "centroid_lnglat": [
        121.48221008638455,
        31.239241362671937
      ],
      "footprint_area_m2": 30031.5,
      "height_m": 62.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B02",
      "kind": "building",
      "polygon_enu": [
        [
          1854.1643270532488,
          1231.8199554170174
        ],
        [
          2010.687982421406,
          1231.8199554170174
        ],
        [
          2010.687982421406,
          1387.669234369773
        ],
        [
          1854.1643270532488,
          1387.669234369773
        ],
        [
          1854.1643270532488,
          1231.8199554170174
        ]
      ],
      "polygon_lnglat": [
        [
          121.49317878720159,
          31.24146557631528
        ],
        [
          121.49482313497079,
          31.24146557631528
        ],
        [
          121.49482313497079,
          31.242865587804257
        ],
        [
          121.49317878720159,
          31.242865587804257
        ],
        [
          121.49317878720159,
          31.24146557631528
        ]
      ],
      "centroid_lnglat": [
        121.49400096108619,
        31.24216558205977
      ],
      "footprint_area_m2": 24394.1,
      "height_m": 88.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B03",
      "kind": "building",
      "polygon_enu": [
        [
          2416.3398951615413,
          812.6122542838694
        ],
        [
          2586.537275409486,
          812.6122542838694
        ],
        [
          2586.537275409486,
          997.2993899211484
        ],
        [
          2416.3398951615413,
          997.2993899211484
        ],
        [
          2416.3398951615413,
          812.6122542838694
        ]
      ],
      "polygon_lnglat": [
        [
          121.49908468135635,
          31.23769978668958
        ],
        [
          121.50087267743832,
          31.23769978668958
        ],
        [
          121.50087267743832,
          31.239358851867777
        ],
        [
          121.49908468135635,
          31.239358851867777
        ],
        [
          121.49908468135635,
          31.23769978668958
        ]
      ],
      "centroid_lnglat": [
        121.49997867939733,
        31.23852931927868
      ],
      "footprint_area_m2": 31433.3,
      "height_m": 42.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B04",
      "kind": "building",
      "polygon_enu": [
        [
          2073.9752564303326,
          1184.9892176915132
        ],
        [
          2278.8467753272275,
          1184.9892176915132
        ],
        [
          2278.8467753272275,
          1297.024428431826
        ],
        [
          2073.9752564303326,
          1297.024428431826
        ],
        [
          2073.9752564303326,
          1184.9892176915132
        ]
      ],
      "polygon_lnglat": [
        [
          121.49548799478121,
          31.24104489056496
        ],
        [
          121.49764025748094,
          31.24104489056496
        ],
        [
          121.49764025748094,
          31.242051315382966
        ],
        [
          121.49548799478121,
          31.242051315382966
        ],
        [
          121.49548799478121,
          31.24104489056496
        ]
      ],
      "centroid_lnglat": [
        121.49656412613108,
        31.241548102973965
      ],
      "footprint_area_m2": 22952.8,
      "height_m": 68.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B05",
      "kind": "building",
      "polygon_enu": [
        [
          1886.0374292344063,
          2254.382405664296
        ],
        [
          2058.6660686714445,
          2254.382405664296
        ],
        [
          2058.6660686714445,
          2404.3452141380185
        ],
        [
          1886.0374292344063,
          2404.3452141380185
        ],
        [
          1886.0374292344063,
          2254.382405664296
        ]
      ],
      "polygon_lnglat": [
        [
          121.49351362773636,
          31.25065136907711
        ],
        [
          121.49532716523325,
          31.25065136907711
        ],
        [
          121.49532716523325,
          31.251998501743962
        ],
        [
          121.49351362773636,
          31.251998501743962
        ],
        [
          121.49351362773636,
          31.25065136907711
        ]
      ],
      "centroid_lnglat": [
        121.4944203964848,
        31.251324935410537
      ],
      "footprint_area_m2": 25887.9,
      "height_m": 94.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B06",
      "kind": "building",
      "polygon_enu": [
        [
          2224.4334948297287,
          1772.0220788227505
        ],
        [
          2360.7856085945855,
          1772.0220788227505
        ],
        [
          2360.7856085945855,
          1923.8300129451056
        ],
        [
          2224.4334948297287,
          1923.8300129451056
        ],
        [
          2224.4334948297287,
          1772.0220788227505
        ]
      ],
      "polygon_lnglat": [
        [
          121.4970686227578,
          31.24631827235737
        ],
        [
          121.49850105987771,
          31.24631827235737
        ],
        [
          121.49850105987771,
          31.247681979994116
        ],
        [
          121.4970686227578,
          31.247681979994116
        ],
        [
          121.4970686227578,
          31.24631827235737
        ]
      ],
      "centroid_lnglat": [
        121.49778484131775,
        31.247000126175745
      ],
      "footprint_area_m2": 20699.3,
      "height_m": 49.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B07",
      "kind": "building",
      "polygon_enu": [
        [
          840.6216955208833,
          2483.577541074151
        ],
        [
          1025.4849076032606,
          2483.577541074151
        ],
        [
          1025.4849076032606,
          2616.555745608421
        ],
        [
          840.6216955208833,
          2616.555745608421
        ],
        [
          840.6216955208833,
          2483.577541074151
        ]
      ],
      "polygon_lnglat": [
        [
          121.48253108950225,
          31.252710254591037
        ],
        [
          121.48447315640377,
          31.252710254591037
        ],
        [
          121.48447315640377,
          31.253904812662668
        ],
        [
          121.48253108950225,
          31.253904812662668
        ],
        [
          121.48253108950225,
          31.252710254591037
        ]
      ],
      "centroid_lnglat": [
        121.48350212295301,
        31.253307533626852
      ],
      "footprint_area_m2": 24582.8,
      "height_m": 75.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B08",
      "kind": "building",
      "polygon_enu": [
        [
          2647.1238870928396,
          1178.4639430685568
        ],
        [
          2755.1951853238993,
          1178.4639430685568
        ],
        [
          2755.1951853238993,
          1269.5964801242324
        ],
        [
          2647.1238870928396,
          1269.5964801242324
        ],
        [
          2647.1238870928396,
          1178.4639430685568
        ]
      ],
      "polygon_lnglat": [
        [
          121.50150916563898,
          31.240986273293824
        ],
        [
          121.50264450072774,
          31.240986273293824
        ],
        [
          121.50264450072774,
          31.241804927058247
        ],
        [
          121.50150916563898,
          31.241804927058247
        ],
        [
          121.50150916563898,
          31.240986273293824
        ]
      ],
      "centroid_lnglat": [
        121.50207683318337,
        31.241395600176038
      ],
      "footprint_area_m2": 9848.8,
      "height_m": 101.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B09",
      "kind": "building",
      "polygon_enu": [
        [
          1810.7984759826859,
          256.12933469851754
        ],
        [
          1913.2025851484423,
          256.12933469851754
        ],
        [
          1913.2025851484423,
          440.52681226696893
        ],
        [
          1810.7984759826859,
          440.52681226696893
        ],
        [
          1810.7984759826859,
          256.12933469851754
        ]
      ],
      "polygon_lnglat": [
        [
          121.49272321043716,
          31.232700838436028
        ],
        [
          121.4937990092873,
          31.232700838436028
        ],
        [
          121.4937990092873,
          31.234357301583426
        ],
        [
          121.49272321043716,
          31.234357301583426
        ],
        [
          121.49272321043716,
          31.232700838436028
        ]
      ],
      "centroid_lnglat": [
        121.49326110986223,
        31.233529070009727
      ],
      "footprint_area_m2": 18883.1,
      "height_m": 55.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B10",
      "kind": "building",
      "polygon_enu": [
        [
          1585.0538650081523,
          2174.2214356811924
        ],
        [
          1675.5602701051491,
          2174.2214356811924
        ],
        [
          1675.5602701051491,
          2352.9635151688935
        ],
        [
          1585.0538650081523,
          2352.9635151688935
        ],
        [
          1585.0538650081523,
          2174.2214356811924
        ]
      ],
      "polygon_lnglat": [
        [
          121.49035166700116,
          31.249931274125775
        ],
        [
          121.49130247539476,
          31.249931274125775
        ],
        [
          121.49130247539476,
          31.251536934200224
        ],
        [
          121.49035166700116,
          31.251536934200224
        ],
        [
          121.49035166700116,
          31.249931274125775
        ]
      ],
      "centroid_lnglat": [
        121.49082707119797,
        31.250734104162998
      ],
      "footprint_area_m2": 16177.3,
      "height_m": 81.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B11",
      "kind": "building",
      "polygon_enu": [
        [
          1322.1375581912027,
          2445.2744333717656
        ],
        [
          1475.5086652915872,
          2445.2744333717656
        ],
        [
          1475.5086652915872,
          2579.550814606506
        ],
        [
          1322.1375581912027,
          2579.550814606506
        ],
        [
          1322.1375581912027,
          2445.2744333717656
        ]
      ],
      "polygon_lnglat": [
        [
          121.48758961904372,
          31.252366173494178
        ],
        [
          121.48920084794857,
          31.252366173494178
        ],
        [
          121.48920084794857,
          31.253572393232183
        ],
        [
          121.48758961904372,
          31.253572393232183
        ],
        [
          121.48758961904372,
          31.252366173494178
        ]
      ],
      "centroid_lnglat": [
        121.48839523349614,
        31.25296928336318
      ],
      "footprint_area_m2": 20594.1,
      "height_m": 36.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B12",
      "kind": "building",
      "polygon_enu": [
        [
          727.000245312231,
          1231.198748171359
        ],
        [
          902.3943614272899,
          1231.198748171359
        ],
        [
          902.3943614272899,
          1410.5962387863567
        ],
        [
          727.000245312231,
          1410.5962387863567
        ],
        [
          727.000245312231,
          1231.198748171359
        ]
      ],
      "polygon_lnglat": [
        [
          121.48133744769937,
          31.241459995941174
        ],
        [
          121.48318003770846,
          31.241459995941174
        ],
        [
          121.48318003770846,
          31.24307154364702
        ],
        [
          121.48133744769937,
          31.24307154364702
        ],
        [
          121.48133744769937,
          31.241459995941174
        ]
      ],
      "centroid_lnglat": [
        121.48225874270392,
        31.242265769794095
      ],
      "footprint_area_m2": 31465.3,
      "height_m": 62.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B13",
      "kind": "building",
      "polygon_enu": [
        [
          978.2073902396286,
          679.5025313755963
        ],
        [
          1141.694006574116,
          679.5025313755963
        ],
        [
          1141.694006574116,
          798.106403454063
        ],
        [
          978.2073902396286,
          798.106403454063
        ],
        [
          978.2073902396286,
          679.5025313755963
        ]
      ],
      "polygon_lnglat": [
        [
          121.48397648591632,
          31.236504047173693
        ],
        [
          121.48569398256072,
          31.236504047173693
        ],
        [
          121.48569398256072,
          31.237569479010546
        ],
        [
          121.48397648591632,
          31.237569479010546
        ],
        [
          121.48397648591632,
          31.236504047173693
        ]
      ],
      "centroid_lnglat": [
        121.48483523423852,
        31.23703676309212
      ],
      "footprint_area_m2": 19390.1,
      "height_m": 88.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B14",
      "kind": "building",
      "polygon_enu": [
        [
          405.4612151562484,
          1989.852313157063
        ],
        [
          519.6343995338572,
          1989.852313157063
        ],
        [
          519.6343995338572,
          2158.687613327794
        ],
        [
          405.4612151562484,
          2158.687613327794
        ],
        [
          405.4612151562484,
          1989.852313157063
        ]
      ],
      "polygon_lnglat": [
        [
          121.47795954302609,
          31.248275065694905
        ],
        [
          121.47915898103174,
          31.248275065694905
        ],
        [
          121.47915898103174,
          31.24979173206367
        ],
        [
          121.47795954302609,
          31.24979173206367
        ],
        [
          121.47795954302609,
          31.248275065694905
        ]
      ],
      "centroid_lnglat": [
        121.47855926202892,
        31.249033398879288
      ],
      "footprint_area_m2": 19276.5,
      "height_m": 42.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B15",
      "kind": "building",
      "polygon_enu": [
        [
          1717.3150611562744,
          2712.9431956865633
        ],
        [
          1839.9643255247179,
          2712.9431956865633
        ],
        [
          1839.9643255247179,
          2810.995871095533
        ],
        [
          1717.3150611562744,
          2810.995871095533
        ],
        [
          1717.3150611562744,
          2712.9431956865633
        ]
      ],
      "polygon_lnglat": [
        [
          121.49174112728643,
          31.25477067189801
        ],
        [
          121.49302961012812,
          31.25477067189801
        ],
        [
          121.49302961012812,
          31.255651490038588
        ],
        [
          121.49174112728643,
          31.255651490038588
        ],
        [
          121.49174112728643,
          31.25477067189801
        ]
      ],
      "centroid_lnglat": [
        121.49238536870728,
        31.255211080968298
      ],
      "footprint_area_m2": 12026.1,
      "height_m": 68.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B16",
      "kind": "building",
      "polygon_enu": [
        [
          198.0740599475357,
          889.90537863155
        ],
        [
          351.6024937274718,
          889.90537863155
        ],
        [
          351.6024937274718,
          1022.0180740553124
        ],
        [
          198.0740599475357,
          1022.0180740553124
        ],
        [
          198.0740599475357,
          889.90537863155
        ]
      ],
      "polygon_lnglat": [
        [
          121.4757808524938,
          31.23839411946309
        ],
        [
          121.47739373418253,
          31.23839411946309
        ],
        [
          121.47739373418253,
          31.239580902569667
        ],
        [
          121.4757808524938,
          31.239580902569667
        ],
        [
          121.4757808524938,
          31.23839411946309
        ]
      ],
      "centroid_lnglat": [
        121.47658729333816,
        31.23898751101638
      ],
      "footprint_area_m2": 20283.1,
      "height_m": 94.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B17",
      "kind": "building",
      "polygon_enu": [
        [
          2368.370952577415,
          2093.0268788563358
        ],
        [
          2511.5169400065456,
          2093.0268788563358
        ],
        [
          2511.5169400065456,
          2269.1715436172776
        ],
        [
          2368.370952577415,
          2269.1715436172776
        ],
        [
          2368.370952577415,
          2093.0268788563358
        ]
      ],
      "polygon_lnglat": [
        [
          121.498580747152,
          31.24920189434833
        ],
        [
          121.50008455681288,
          31.24920189434833
        ],
        [
          121.50008455681288,
          31.250784221556028
        ],
        [
          121.498580747152,
          31.250784221556028
        ],
        [
          121.498580747152,
          31.24920189434833
        ]
      ],
      "centroid_lnglat": [
        121.49933265198244,
        31.24999305795218
      ],
      "footprint_area_m2": 25214.4,
      "height_m": 49.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B18",
      "kind": "building",
      "polygon_enu": [
        [
          1674.389665790025,
          1868.1041100255843
        ],
        [
          1770.0893552018438,
          1868.1041100255843
        ],
        [
          1770.0893552018438,
          2042.9038907933364
        ],
        [
          1674.389665790025,
          2042.9038907933364
        ],
        [
          1674.389665790025,
          1868.1041100255843
        ]
      ],
      "polygon_lnglat": [
        [
          121.49129017769708,
          31.247181387980827
        ],
        [
          121.49229554375773,
          31.247181387980827
        ],
        [
          121.49229554375773,
          31.24875163394532
        ],
        [
          121.49129017769708,
          31.24875163394532
        ],
        [
          121.49129017769708,
          31.247181387980827
        ]
      ],
      "centroid_lnglat": [
        121.49179286072741,
        31.247966510963074
      ],
      "footprint_area_m2": 16728.3,
      "height_m": 75.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B19",
      "kind": "building",
      "polygon_enu": [
        [
          418.8447216926137,
          784.264070920201
        ],
        [
          579.0073668424764,
          784.264070920201
        ],
        [
          579.0073668424764,
          885.7076621069148
        ],
        [
          418.8447216926137,
          885.7076621069148
        ],
        [
          418.8447216926137,
          784.264070920201
        ]
      ],
      "polygon_lnglat": [
        [
          121.47810014247136,
          31.237445131790516
        ],
        [
          121.47978271938054,
          31.237445131790516
        ],
        [
          121.47978271938054,
          31.23835641090646
        ],
        [
          121.47810014247136,
          31.23835641090646
        ],
        [
          121.47810014247136,
          31.237445131790516
        ]
      ],
      "centroid_lnglat": [
        121.47894143092594,
        31.237900771348485
      ],
      "footprint_area_m2": 16247.5,
      "height_m": 101.0,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    },
    {
      "obstacle_id": "B20",
      "kind": "building",
      "polygon_enu": [
        [
          1330.446471207455,
          463.625395790551
        ],
        [
          1539.4762061043793,
          463.625395790551
        ],
        [
          1539.4762061043793,
          634.8661112271278
        ],
        [
          1330.446471207455,
          634.8661112271278
        ],
        [
          1330.446471207455,
          463.625395790551
        ]
      ],
      "polygon_lnglat": [
        [
          121.48767690771936,
          31.234564798740482
        ],
        [
          121.48987285425196,
          31.234564798740482
        ],
        [
          121.48987285425196,
          31.236103073223383
        ],
        [
          121.48767690771936,
          31.236103073223383
        ],
        [
          121.48767690771936,
          31.234564798740482
        ]
      ],
      "centroid_lnglat": [
        121.48877488098566,
        31.235333935981934
      ],
      "footprint_area_m2": 35794.4,
      "height_m": 55.5,
      "height_ref": "agl",
      "height_source": "demo_derived",
      "is_simulated": true,
      "source": "自建虚拟城区 v0"
    }
  ],
  "tasks": [
    {
      "task_id": "T-S1-01",
      "scenario_ref": "S1-01",
      "title": "正常配送 · 对角线基准",
      "status": "delivered",
      "origin": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 150,
        "y_m": 150
      },
      "destination": {
        "frame": "enu_m",
        "alt_m": 30,
        "alt_ref": "agl",
        "x_m": 2650,
        "y_m": 2750
      },
      "payload_kg": 1.0,
      "vehicle_type": "placeholder",
      "initial_energy_wh": 30.0,
      "reserve_energy_wh": 8.0,
      "time_limit_s": 600,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "task_id": "T-S2-01",
      "scenario_ref": "S2-01",
      "title": "改线 · 起飞后 40 s 限制区生效",
      "status": "in_flight",
      "origin": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 300,
        "y_m": 300
      },
      "destination": {
        "frame": "enu_m",
        "alt_m": 30,
        "alt_ref": "agl",
        "x_m": 2700,
        "y_m": 2700
      },
      "payload_kg": 1.0,
      "vehicle_type": "placeholder",
      "initial_energy_wh": 30.0,
      "reserve_energy_wh": 8.0,
      "time_limit_s": 700,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "task_id": "T-S2-04",
      "scenario_ref": "S2-04",
      "title": "改线 · 起飞前已知限制区",
      "status": "queued",
      "origin": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 500,
        "y_m": 1500
      },
      "destination": {
        "frame": "enu_m",
        "alt_m": 30,
        "alt_ref": "agl",
        "x_m": 2500,
        "y_m": 1500
      },
      "payload_kg": 1.0,
      "vehicle_type": "placeholder",
      "initial_energy_wh": 30.0,
      "reserve_energy_wh": 8.0,
      "time_limit_s": 600,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "task_id": "T-S3-03",
      "scenario_ref": "S3-03",
      "title": "断连期间限制区生效（消息到不了）",
      "status": "in_flight",
      "origin": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 600,
        "y_m": 600
      },
      "destination": {
        "frame": "enu_m",
        "alt_m": 35,
        "alt_ref": "agl",
        "x_m": 2400,
        "y_m": 2400
      },
      "payload_kg": 1.1,
      "vehicle_type": "placeholder",
      "initial_energy_wh": 30.0,
      "reserve_energy_wh": 8.0,
      "time_limit_s": 700,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "task_id": "T-S4-01",
      "scenario_ref": "S4-01",
      "title": "不可行 · 载荷超出机型能力（6.0 kg）",
      "status": "infeasible",
      "origin": {
        "frame": "enu_m",
        "alt_m": 0,
        "alt_ref": "agl",
        "x_m": 400,
        "y_m": 400
      },
      "destination": {
        "frame": "enu_m",
        "alt_m": 30,
        "alt_ref": "agl",
        "x_m": 2600,
        "y_m": 2600
      },
      "payload_kg": 6.0,
      "vehicle_type": "placeholder",
      "initial_energy_wh": 30.0,
      "reserve_energy_wh": 8.0,
      "time_limit_s": 900,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    }
  ],
  "routes": [
    {
      "route_id": "RT-S2-01-A",
      "task_id": "T-S2-01",
      "plan_version": "v1",
      "snapshot_id": "SN-S2-01-01",
      "algorithm": "astar_static",
      "waypoints": [
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 300,
          "y_m": 300
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 1400,
          "y_m": 1500
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2700,
          "y_m": 2700
        }
      ],
      "energy_budget_wh": 18.0,
      "diversion_site_id": "L2",
      "valid_until": "2026-11-10T00:20:00Z",
      "checks": [
        {
          "name": "restriction_zone",
          "passed": false,
          "detail": "航段穿越 R01 生效时段（起飞后 40 s 起）"
        },
        {
          "name": "diversion_reachability",
          "passed": false,
          "detail": "中段退出距离超过剩余可用能量"
        },
        {
          "name": "energy",
          "passed": true,
          "detail": "按静态预算估算，未计入备降退出开销"
        }
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S2-01-B",
      "task_id": "T-S2-01",
      "plan_version": "v2",
      "snapshot_id": "SN-S2-01-02",
      "algorithm": "astar_diversion_aware",
      "waypoints": [
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 300,
          "y_m": 300
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2050,
          "y_m": 300
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2050,
          "y_m": 2050
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2700,
          "y_m": 2050
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2700,
          "y_m": 2700
        }
      ],
      "energy_budget_wh": 20.0,
      "diversion_site_id": "L2",
      "valid_until": "2026-11-10T00:25:00Z",
      "checks": [
        {
          "name": "restriction_zone",
          "passed": true,
          "detail": "绕开 R01–R04，航段与限制区无相交"
        },
        {
          "name": "diversion_reachability",
          "passed": true,
          "detail": "全程存在有效退出方案，最近备降点 L2"
        },
        {
          "name": "energy",
          "passed": true,
          "detail": "预留 20 Wh 预算，含备降退出开销"
        }
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S1-01-A",
      "task_id": "T-S1-01",
      "plan_version": "v1",
      "snapshot_id": "SN-S1-01-01",
      "algorithm": "astar_static",
      "waypoints": [
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 150,
          "y_m": 150
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 1300,
          "y_m": 1200
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2450,
          "y_m": 1200
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2450,
          "y_m": 2400
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2650,
          "y_m": 2400
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2650,
          "y_m": 2750
        }
      ],
      "energy_budget_wh": 18.0,
      "diversion_site_id": "L4",
      "valid_until": "2026-11-10T00:20:00Z",
      "checks": [
        {
          "name": "restriction_zone",
          "passed": true,
          "detail": "沿走廊绕开 R01–R04"
        },
        {
          "name": "diversion_reachability",
          "passed": true,
          "detail": "全程有退出方案"
        },
        {
          "name": "energy",
          "passed": true,
          "detail": "正常配送预算内"
        }
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S2-04-A",
      "task_id": "T-S2-04",
      "plan_version": "v1",
      "snapshot_id": "SN-S2-04-01",
      "algorithm": "astar_static",
      "waypoints": [
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 500,
          "y_m": 1500
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 1180,
          "y_m": 1770
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 1850,
          "y_m": 1770
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 1850,
          "y_m": 1500
        },
        {
          "frame": "enu_m",
          "alt_m": 30,
          "alt_ref": "agl",
          "x_m": 2500,
          "y_m": 1500
        }
      ],
      "energy_budget_wh": 12.0,
      "diversion_site_id": "L2",
      "valid_until": "2026-11-10T00:15:00Z",
      "checks": [
        {
          "name": "restriction_zone",
          "passed": true,
          "detail": "起飞前已知 R01，从北侧绕行，无相交"
        },
        {
          "name": "diversion_reachability",
          "passed": true,
          "detail": "绕行段退出到 L2 不穿越 R01"
        },
        {
          "name": "energy",
          "passed": true,
          "detail": "预算内"
        }
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S3-03-A",
      "task_id": "T-S3-03",
      "plan_version": "v1",
      "snapshot_id": "SN-S3-03-01",
      "algorithm": "astar_static",
      "waypoints": [
        {
          "frame": "enu_m",
          "alt_m": 35,
          "alt_ref": "agl",
          "x_m": 600,
          "y_m": 600
        },
        {
          "frame": "enu_m",
          "alt_m": 35,
          "alt_ref": "agl",
          "x_m": 1100,
          "y_m": 1100
        },
        {
          "frame": "enu_m",
          "alt_m": 35,
          "alt_ref": "agl",
          "x_m": 1100,
          "y_m": 2000
        },
        {
          "frame": "enu_m",
          "alt_m": 35,
          "alt_ref": "agl",
          "x_m": 2400,
          "y_m": 2400
        }
      ],
      "energy_budget_wh": 14.0,
      "diversion_site_id": "L2",
      "valid_until": "2026-11-10T00:20:00Z",
      "checks": [
        {
          "name": "restriction_zone",
          "passed": false,
          "detail": "航段与 R03 相交；R03 在断连期间生效，机载侧未知情"
        },
        {
          "name": "diversion_reachability",
          "passed": true,
          "detail": "按断连前快照判定可用"
        },
        {
          "name": "energy",
          "passed": true,
          "detail": "预算内"
        }
      ],
      "is_simulated": true
    }
  ],
  "margin_profiles": [
    {
      "route_id": "RT-S2-01-A",
      "task_id": "T-S2-01",
      "plan_version": "v1",
      "reserve_wh": 8.0,
      "samples": [
        {"s_m":0.0,"t_s":0.0,"margin_wh":13.84,"nearest_site_id":"L1","e_left_wh":30.0,"e_need_wh":8.16},
        {"s_m":15.0,"t_s":1.2,"margin_wh":13.98,"nearest_site_id":"L1","e_left_wh":29.98,"e_need_wh":8.01},
        {"s_m":30.0,"t_s":2.5,"margin_wh":14.11,"nearest_site_id":"L1","e_left_wh":29.96,"e_need_wh":7.86},
        {"s_m":45.0,"t_s":3.8,"margin_wh":14.24,"nearest_site_id":"L1","e_left_wh":29.95,"e_need_wh":7.71},
        {"s_m":60.0,"t_s":5.0,"margin_wh":14.37,"nearest_site_id":"L1","e_left_wh":29.93,"e_need_wh":7.56},
        {"s_m":75.0,"t_s":6.2,"margin_wh":14.5,"nearest_site_id":"L1","e_left_wh":29.91,"e_need_wh":7.41},
        {"s_m":90.0,"t_s":7.5,"margin_wh":14.63,"nearest_site_id":"L1","e_left_wh":29.89,"e_need_wh":7.26},
        {"s_m":105.0,"t_s":8.8,"margin_wh":14.77,"nearest_site_id":"L1","e_left_wh":29.87,"e_need_wh":7.11},
        {"s_m":120.0,"t_s":10.0,"margin_wh":14.9,"nearest_site_id":"L1","e_left_wh":29.86,"e_need_wh":6.96},
        {"s_m":135.0,"t_s":11.2,"margin_wh":15.03,"nearest_site_id":"L1","e_left_wh":29.84,"e_need_wh":6.81},
        {"s_m":150.0,"t_s":12.5,"margin_wh":15.16,"nearest_site_id":"L1","e_left_wh":29.82,"e_need_wh":6.66},
        {"s_m":165.0,"t_s":13.8,"margin_wh":15.29,"nearest_site_id":"L1","e_left_wh":29.8,"e_need_wh":6.51},
        {"s_m":180.0,"t_s":15.0,"margin_wh":15.42,"nearest_site_id":"L1","e_left_wh":29.78,"e_need_wh":6.36},
        {"s_m":195.0,"t_s":16.2,"margin_wh":15.56,"nearest_site_id":"L1","e_left_wh":29.77,"e_need_wh":6.21},
        {"s_m":210.0,"t_s":17.5,"margin_wh":15.69,"nearest_site_id":"L1","e_left_wh":29.75,"e_need_wh":6.06},
        {"s_m":225.0,"t_s":18.8,"margin_wh":15.82,"nearest_site_id":"L1","e_left_wh":29.73,"e_need_wh":5.91},
        {"s_m":240.0,"t_s":20.0,"margin_wh":15.95,"nearest_site_id":"L1","e_left_wh":29.71,"e_need_wh":5.76},
        {"s_m":255.0,"t_s":21.2,"margin_wh":16.08,"nearest_site_id":"L1","e_left_wh":29.69,"e_need_wh":5.61},
        {"s_m":270.0,"t_s":22.5,"margin_wh":16.21,"nearest_site_id":"L1","e_left_wh":29.68,"e_need_wh":5.46},
        {"s_m":285.0,"t_s":23.8,"margin_wh":16.35,"nearest_site_id":"L1","e_left_wh":29.66,"e_need_wh":5.31},
        {"s_m":300.0,"t_s":25.0,"margin_wh":16.48,"nearest_site_id":"L1","e_left_wh":29.64,"e_need_wh":5.16},
        {"s_m":315.0,"t_s":26.2,"margin_wh":16.61,"nearest_site_id":"L1","e_left_wh":29.62,"e_need_wh":5.01},
        {"s_m":330.0,"t_s":27.5,"margin_wh":16.74,"nearest_site_id":"L1","e_left_wh":29.6,"e_need_wh":4.86},
        {"s_m":345.0,"t_s":28.8,"margin_wh":16.87,"nearest_site_id":"L1","e_left_wh":29.59,"e_need_wh":4.72},
        {"s_m":360.0,"t_s":30.0,"margin_wh":17.0,"nearest_site_id":"L1","e_left_wh":29.57,"e_need_wh":4.57},
        {"s_m":375.0,"t_s":31.2,"margin_wh":17.13,"nearest_site_id":"L1","e_left_wh":29.55,"e_need_wh":4.42},
        {"s_m":390.0,"t_s":32.5,"margin_wh":17.26,"nearest_site_id":"L1","e_left_wh":29.53,"e_need_wh":4.27},
        {"s_m":405.0,"t_s":33.8,"margin_wh":17.39,"nearest_site_id":"L1","e_left_wh":29.51,"e_need_wh":4.12},
        {"s_m":420.0,"t_s":35.0,"margin_wh":17.52,"nearest_site_id":"L1","e_left_wh":29.5,"e_need_wh":3.97},
        {"s_m":435.0,"t_s":36.2,"margin_wh":17.65,"nearest_site_id":"L1","e_left_wh":29.48,"e_need_wh":3.82},
        {"s_m":450.0,"t_s":37.5,"margin_wh":17.78,"nearest_site_id":"L1","e_left_wh":29.46,"e_need_wh":3.68},
        {"s_m":465.0,"t_s":38.8,"margin_wh":17.91,"nearest_site_id":"L1","e_left_wh":29.44,"e_need_wh":3.53},
        {"s_m":480.0,"t_s":40.0,"margin_wh":18.04,"nearest_site_id":"L1","e_left_wh":29.42,"e_need_wh":3.39},
        {"s_m":495.0,"t_s":41.2,"margin_wh":18.16,"nearest_site_id":"L1","e_left_wh":29.41,"e_need_wh":3.24},
        {"s_m":510.0,"t_s":42.5,"margin_wh":18.28,"nearest_site_id":"L1","e_left_wh":29.39,"e_need_wh":3.1},
        {"s_m":525.0,"t_s":43.8,"margin_wh":18.4,"nearest_site_id":"L1","e_left_wh":29.37,"e_need_wh":2.97},
        {"s_m":540.0,"t_s":45.0,"margin_wh":18.5,"nearest_site_id":"L1","e_left_wh":29.35,"e_need_wh":2.85},
        {"s_m":555.0,"t_s":46.2,"margin_wh":18.57,"nearest_site_id":"L1","e_left_wh":29.33,"e_need_wh":2.77},
        {"s_m":570.0,"t_s":47.5,"margin_wh":18.57,"nearest_site_id":"L1","e_left_wh":29.32,"e_need_wh":2.75},
        {"s_m":585.0,"t_s":48.8,"margin_wh":18.48,"nearest_site_id":"L1","e_left_wh":29.3,"e_need_wh":2.82},
        {"s_m":600.0,"t_s":50.0,"margin_wh":18.35,"nearest_site_id":"L1","e_left_wh":29.28,"e_need_wh":2.93},
        {"s_m":615.0,"t_s":51.2,"margin_wh":18.21,"nearest_site_id":"L1","e_left_wh":29.26,"e_need_wh":3.06},
        {"s_m":630.0,"t_s":52.5,"margin_wh":18.05,"nearest_site_id":"L1","e_left_wh":29.24,"e_need_wh":3.19},
        {"s_m":645.0,"t_s":53.8,"margin_wh":17.89,"nearest_site_id":"L1","e_left_wh":29.23,"e_need_wh":3.34},
        {"s_m":660.0,"t_s":55.0,"margin_wh":17.73,"nearest_site_id":"L1","e_left_wh":29.21,"e_need_wh":3.48},
        {"s_m":675.0,"t_s":56.2,"margin_wh":17.56,"nearest_site_id":"L1","e_left_wh":29.19,"e_need_wh":3.63},
        {"s_m":690.0,"t_s":57.5,"margin_wh":17.4,"nearest_site_id":"L1","e_left_wh":29.17,"e_need_wh":3.77},
        {"s_m":705.0,"t_s":58.8,"margin_wh":17.23,"nearest_site_id":"L1","e_left_wh":29.15,"e_need_wh":3.92},
        {"s_m":720.0,"t_s":60.0,"margin_wh":17.07,"nearest_site_id":"L1","e_left_wh":29.14,"e_need_wh":4.07},
        {"s_m":735.0,"t_s":61.2,"margin_wh":16.9,"nearest_site_id":"L1","e_left_wh":29.12,"e_need_wh":4.22},
        {"s_m":750.0,"t_s":62.5,"margin_wh":16.74,"nearest_site_id":"L1","e_left_wh":29.1,"e_need_wh":4.36},
        {"s_m":765.0,"t_s":63.8,"margin_wh":16.57,"nearest_site_id":"L1","e_left_wh":29.08,"e_need_wh":4.51},
        {"s_m":780.0,"t_s":65.0,"margin_wh":16.4,"nearest_site_id":"L1","e_left_wh":29.06,"e_need_wh":4.66},
        {"s_m":795.0,"t_s":66.2,"margin_wh":16.23,"nearest_site_id":"L1","e_left_wh":29.05,"e_need_wh":4.81},
        {"s_m":810.0,"t_s":67.5,"margin_wh":16.07,"nearest_site_id":"L1","e_left_wh":29.03,"e_need_wh":4.96},
        {"s_m":825.0,"t_s":68.8,"margin_wh":15.9,"nearest_site_id":"L1","e_left_wh":29.01,"e_need_wh":5.11},
        {"s_m":840.0,"t_s":70.0,"margin_wh":15.73,"nearest_site_id":"L1","e_left_wh":28.99,"e_need_wh":5.26},
        {"s_m":855.0,"t_s":71.2,"margin_wh":15.57,"nearest_site_id":"L1","e_left_wh":28.97,"e_need_wh":5.41},
        {"s_m":870.0,"t_s":72.5,"margin_wh":15.4,"nearest_site_id":"L1","e_left_wh":28.96,"e_need_wh":5.56},
        {"s_m":885.0,"t_s":73.8,"margin_wh":15.23,"nearest_site_id":"L1","e_left_wh":28.94,"e_need_wh":5.71},
        {"s_m":900.0,"t_s":75.0,"margin_wh":15.06,"nearest_site_id":"L1","e_left_wh":28.92,"e_need_wh":5.86},
        {"s_m":915.0,"t_s":76.2,"margin_wh":14.89,"nearest_site_id":"L1","e_left_wh":28.9,"e_need_wh":6.01},
        {"s_m":930.0,"t_s":77.5,"margin_wh":14.73,"nearest_site_id":"L1","e_left_wh":28.88,"e_need_wh":6.16},
        {"s_m":945.0,"t_s":78.8,"margin_wh":14.56,"nearest_site_id":"L1","e_left_wh":28.87,"e_need_wh":6.31},
        {"s_m":960.0,"t_s":80.0,"margin_wh":14.39,"nearest_site_id":"L1","e_left_wh":28.85,"e_need_wh":6.46},
        {"s_m":975.0,"t_s":81.2,"margin_wh":14.22,"nearest_site_id":"L1","e_left_wh":28.83,"e_need_wh":6.61},
        {"s_m":990.0,"t_s":82.5,"margin_wh":14.06,"nearest_site_id":"L1","e_left_wh":28.81,"e_need_wh":6.76},
        {"s_m":1005.0,"t_s":83.8,"margin_wh":13.89,"nearest_site_id":"L1","e_left_wh":28.79,"e_need_wh":6.91},
        {"s_m":1020.0,"t_s":85.0,"margin_wh":13.72,"nearest_site_id":"L1","e_left_wh":28.78,"e_need_wh":7.06},
        {"s_m":1035.0,"t_s":86.2,"margin_wh":13.55,"nearest_site_id":"L1","e_left_wh":28.76,"e_need_wh":7.2},
        {"s_m":1050.0,"t_s":87.5,"margin_wh":13.39,"nearest_site_id":"L1","e_left_wh":28.74,"e_need_wh":7.35},
        {"s_m":1065.0,"t_s":88.8,"margin_wh":13.22,"nearest_site_id":"L1","e_left_wh":28.72,"e_need_wh":7.5},
        {"s_m":1080.0,"t_s":90.0,"margin_wh":13.05,"nearest_site_id":"L1","e_left_wh":28.7,"e_need_wh":7.65},
        {"s_m":1095.0,"t_s":91.2,"margin_wh":12.88,"nearest_site_id":"L1","e_left_wh":28.69,"e_need_wh":7.8},
        {"s_m":1110.0,"t_s":92.5,"margin_wh":12.71,"nearest_site_id":"L1","e_left_wh":28.67,"e_need_wh":7.95},
        {"s_m":1125.0,"t_s":93.8,"margin_wh":12.55,"nearest_site_id":"L1","e_left_wh":28.65,"e_need_wh":8.1},
        {"s_m":1140.0,"t_s":95.0,"margin_wh":12.38,"nearest_site_id":"L1","e_left_wh":28.63,"e_need_wh":8.25},
        {"s_m":1155.0,"t_s":96.2,"margin_wh":12.21,"nearest_site_id":"L1","e_left_wh":28.61,"e_need_wh":8.4},
        {"s_m":1170.0,"t_s":97.5,"margin_wh":12.04,"nearest_site_id":"L1","e_left_wh":28.6,"e_need_wh":8.55},
        {"s_m":1185.0,"t_s":98.8,"margin_wh":11.87,"nearest_site_id":"L1","e_left_wh":28.58,"e_need_wh":8.7},
        {"s_m":1200.0,"t_s":100.0,"margin_wh":11.71,"nearest_site_id":"L1","e_left_wh":28.56,"e_need_wh":8.85},
        {"s_m":1215.0,"t_s":101.2,"margin_wh":11.54,"nearest_site_id":"L1","e_left_wh":28.54,"e_need_wh":9.0},
        {"s_m":1230.0,"t_s":102.5,"margin_wh":11.37,"nearest_site_id":"L1","e_left_wh":28.52,"e_need_wh":9.15},
        {"s_m":1245.0,"t_s":103.8,"margin_wh":11.2,"nearest_site_id":"L1","e_left_wh":28.51,"e_need_wh":9.3},
        {"s_m":1260.0,"t_s":105.0,"margin_wh":11.04,"nearest_site_id":"L1","e_left_wh":28.49,"e_need_wh":9.45},
        {"s_m":1275.0,"t_s":106.2,"margin_wh":10.87,"nearest_site_id":"L1","e_left_wh":28.47,"e_need_wh":9.6},
        {"s_m":1290.0,"t_s":107.5,"margin_wh":10.7,"nearest_site_id":"L1","e_left_wh":28.45,"e_need_wh":9.75},
        {"s_m":1305.0,"t_s":108.8,"margin_wh":10.53,"nearest_site_id":"L1","e_left_wh":28.43,"e_need_wh":9.9},
        {"s_m":1320.0,"t_s":110.0,"margin_wh":10.36,"nearest_site_id":"L1","e_left_wh":28.42,"e_need_wh":10.05},
        {"s_m":1335.0,"t_s":111.2,"margin_wh":10.2,"nearest_site_id":"L1","e_left_wh":28.4,"e_need_wh":10.2},
        {"s_m":1350.0,"t_s":112.5,"margin_wh":10.03,"nearest_site_id":"L1","e_left_wh":28.38,"e_need_wh":10.35},
        {"s_m":1365.0,"t_s":113.8,"margin_wh":9.86,"nearest_site_id":"L1","e_left_wh":28.36,"e_need_wh":10.5},
        {"s_m":1380.0,"t_s":115.0,"margin_wh":9.69,"nearest_site_id":"L1","e_left_wh":28.34,"e_need_wh":10.65},
        {"s_m":1395.0,"t_s":116.2,"margin_wh":9.52,"nearest_site_id":"L1","e_left_wh":28.33,"e_need_wh":10.8},
        {"s_m":1410.0,"t_s":117.5,"margin_wh":9.36,"nearest_site_id":"L1","e_left_wh":28.31,"e_need_wh":10.95},
        {"s_m":1425.0,"t_s":118.8,"margin_wh":-4.09,"nearest_site_id":"L2","e_left_wh":28.29,"e_need_wh":24.38},
        {"s_m":1440.0,"t_s":120.0,"margin_wh":-3.72,"nearest_site_id":"L2","e_left_wh":28.27,"e_need_wh":23.99},
        {"s_m":1455.0,"t_s":121.2,"margin_wh":-3.35,"nearest_site_id":"L2","e_left_wh":28.25,"e_need_wh":23.6},
        {"s_m":1470.0,"t_s":122.5,"margin_wh":-2.98,"nearest_site_id":"L2","e_left_wh":28.24,"e_need_wh":23.21},
        {"s_m":1485.0,"t_s":123.8,"margin_wh":-2.61,"nearest_site_id":"L2","e_left_wh":28.22,"e_need_wh":22.83},
        {"s_m":1500.0,"t_s":125.0,"margin_wh":-2.24,"nearest_site_id":"L2","e_left_wh":28.2,"e_need_wh":22.44},
        {"s_m":1515.0,"t_s":126.2,"margin_wh":-1.87,"nearest_site_id":"L2","e_left_wh":28.18,"e_need_wh":22.05},
        {"s_m":1530.0,"t_s":127.5,"margin_wh":-1.5,"nearest_site_id":"L2","e_left_wh":28.16,"e_need_wh":21.67},
        {"s_m":1545.0,"t_s":128.8,"margin_wh":-1.13,"nearest_site_id":"L2","e_left_wh":28.15,"e_need_wh":21.28},
        {"s_m":1560.0,"t_s":130.0,"margin_wh":-0.77,"nearest_site_id":"L2","e_left_wh":28.13,"e_need_wh":20.89},
        {"s_m":1575.0,"t_s":131.2,"margin_wh":-0.4,"nearest_site_id":"L2","e_left_wh":28.11,"e_need_wh":20.51},
        {"s_m":1590.0,"t_s":132.5,"margin_wh":-0.03,"nearest_site_id":"L2","e_left_wh":28.09,"e_need_wh":20.12},
        {"s_m":1605.0,"t_s":133.8,"margin_wh":0.34,"nearest_site_id":"L2","e_left_wh":28.07,"e_need_wh":19.74},
        {"s_m":1620.0,"t_s":135.0,"margin_wh":0.71,"nearest_site_id":"L2","e_left_wh":28.06,"e_need_wh":19.35},
        {"s_m":1635.0,"t_s":136.2,"margin_wh":1.07,"nearest_site_id":"L2","e_left_wh":28.04,"e_need_wh":18.96},
        {"s_m":1650.0,"t_s":137.5,"margin_wh":1.45,"nearest_site_id":"L2","e_left_wh":28.02,"e_need_wh":18.57},
        {"s_m":1665.0,"t_s":138.8,"margin_wh":1.82,"nearest_site_id":"L2","e_left_wh":28.0,"e_need_wh":18.19},
        {"s_m":1680.0,"t_s":140.0,"margin_wh":2.19,"nearest_site_id":"L2","e_left_wh":27.98,"e_need_wh":17.8},
        {"s_m":1695.0,"t_s":141.2,"margin_wh":2.56,"nearest_site_id":"L2","e_left_wh":27.97,"e_need_wh":17.41},
        {"s_m":1710.0,"t_s":142.5,"margin_wh":2.93,"nearest_site_id":"L2","e_left_wh":27.95,"e_need_wh":17.02},
        {"s_m":1725.0,"t_s":143.8,"margin_wh":3.3,"nearest_site_id":"L2","e_left_wh":27.93,"e_need_wh":16.63},
        {"s_m":1740.0,"t_s":145.0,"margin_wh":3.67,"nearest_site_id":"L2","e_left_wh":27.91,"e_need_wh":16.24},
        {"s_m":1755.0,"t_s":146.2,"margin_wh":4.04,"nearest_site_id":"L2","e_left_wh":27.89,"e_need_wh":15.85},
        {"s_m":1770.0,"t_s":147.5,"margin_wh":4.41,"nearest_site_id":"L2","e_left_wh":27.88,"e_need_wh":15.46},
        {"s_m":1785.0,"t_s":148.8,"margin_wh":4.78,"nearest_site_id":"L2","e_left_wh":27.86,"e_need_wh":15.08},
        {"s_m":1800.0,"t_s":150.0,"margin_wh":5.15,"nearest_site_id":"L2","e_left_wh":27.84,"e_need_wh":14.69},
        {"s_m":1815.0,"t_s":151.2,"margin_wh":5.52,"nearest_site_id":"L2","e_left_wh":27.82,"e_need_wh":14.3},
        {"s_m":1830.0,"t_s":152.5,"margin_wh":5.89,"nearest_site_id":"L2","e_left_wh":27.8,"e_need_wh":13.91},
        {"s_m":1845.0,"t_s":153.8,"margin_wh":6.26,"nearest_site_id":"L2","e_left_wh":27.79,"e_need_wh":13.52},
        {"s_m":1860.0,"t_s":155.0,"margin_wh":6.63,"nearest_site_id":"L2","e_left_wh":27.77,"e_need_wh":13.14},
        {"s_m":1875.0,"t_s":156.2,"margin_wh":7.0,"nearest_site_id":"L2","e_left_wh":27.75,"e_need_wh":12.75},
        {"s_m":1890.0,"t_s":157.5,"margin_wh":7.37,"nearest_site_id":"L2","e_left_wh":27.73,"e_need_wh":12.36},
        {"s_m":1905.0,"t_s":158.8,"margin_wh":7.74,"nearest_site_id":"L2","e_left_wh":27.71,"e_need_wh":11.97},
        {"s_m":1920.0,"t_s":160.0,"margin_wh":8.11,"nearest_site_id":"L2","e_left_wh":27.7,"e_need_wh":11.59},
        {"s_m":1935.0,"t_s":161.2,"margin_wh":13.83,"nearest_site_id":"L2","e_left_wh":27.68,"e_need_wh":5.85},
        {"s_m":1950.0,"t_s":162.5,"margin_wh":13.96,"nearest_site_id":"L2","e_left_wh":27.66,"e_need_wh":5.7},
        {"s_m":1965.0,"t_s":163.8,"margin_wh":14.09,"nearest_site_id":"L2","e_left_wh":27.64,"e_need_wh":5.55},
        {"s_m":1980.0,"t_s":165.0,"margin_wh":14.22,"nearest_site_id":"L2","e_left_wh":27.62,"e_need_wh":5.4},
        {"s_m":1995.0,"t_s":166.2,"margin_wh":14.35,"nearest_site_id":"L2","e_left_wh":27.61,"e_need_wh":5.25},
        {"s_m":2010.0,"t_s":167.5,"margin_wh":14.48,"nearest_site_id":"L2","e_left_wh":27.59,"e_need_wh":5.11},
        {"s_m":2025.0,"t_s":168.8,"margin_wh":14.61,"nearest_site_id":"L2","e_left_wh":27.57,"e_need_wh":4.96},
        {"s_m":2040.0,"t_s":170.0,"margin_wh":14.74,"nearest_site_id":"L2","e_left_wh":27.55,"e_need_wh":4.81},
        {"s_m":2055.0,"t_s":171.2,"margin_wh":14.87,"nearest_site_id":"L2","e_left_wh":27.53,"e_need_wh":4.66},
        {"s_m":2070.0,"t_s":172.5,"margin_wh":15.0,"nearest_site_id":"L2","e_left_wh":27.52,"e_need_wh":4.52},
        {"s_m":2085.0,"t_s":173.8,"margin_wh":15.13,"nearest_site_id":"L2","e_left_wh":27.5,"e_need_wh":4.37},
        {"s_m":2100.0,"t_s":175.0,"margin_wh":15.25,"nearest_site_id":"L2","e_left_wh":27.48,"e_need_wh":4.23},
        {"s_m":2115.0,"t_s":176.2,"margin_wh":15.38,"nearest_site_id":"L2","e_left_wh":27.46,"e_need_wh":4.08},
        {"s_m":2130.0,"t_s":177.5,"margin_wh":15.51,"nearest_site_id":"L2","e_left_wh":27.44,"e_need_wh":3.94},
        {"s_m":2145.0,"t_s":178.8,"margin_wh":15.63,"nearest_site_id":"L2","e_left_wh":27.43,"e_need_wh":3.8},
        {"s_m":2160.0,"t_s":180.0,"margin_wh":15.75,"nearest_site_id":"L2","e_left_wh":27.41,"e_need_wh":3.66},
        {"s_m":2175.0,"t_s":181.2,"margin_wh":15.87,"nearest_site_id":"L2","e_left_wh":27.39,"e_need_wh":3.52},
        {"s_m":2190.0,"t_s":182.5,"margin_wh":15.98,"nearest_site_id":"L2","e_left_wh":27.37,"e_need_wh":3.39},
        {"s_m":2205.0,"t_s":183.8,"margin_wh":16.09,"nearest_site_id":"L2","e_left_wh":27.35,"e_need_wh":3.26},
        {"s_m":2220.0,"t_s":185.0,"margin_wh":16.19,"nearest_site_id":"L2","e_left_wh":27.34,"e_need_wh":3.15},
        {"s_m":2235.0,"t_s":186.2,"margin_wh":16.27,"nearest_site_id":"L2","e_left_wh":27.32,"e_need_wh":3.05},
        {"s_m":2250.0,"t_s":187.5,"margin_wh":16.32,"nearest_site_id":"L2","e_left_wh":27.3,"e_need_wh":2.98},
        {"s_m":2265.0,"t_s":188.8,"margin_wh":16.33,"nearest_site_id":"L2","e_left_wh":27.28,"e_need_wh":2.95},
        {"s_m":2280.0,"t_s":190.0,"margin_wh":16.29,"nearest_site_id":"L2","e_left_wh":27.26,"e_need_wh":2.97},
        {"s_m":2295.0,"t_s":191.2,"margin_wh":16.21,"nearest_site_id":"L2","e_left_wh":27.25,"e_need_wh":3.03},
        {"s_m":2310.0,"t_s":192.5,"margin_wh":16.1,"nearest_site_id":"L2","e_left_wh":27.23,"e_need_wh":3.13},
        {"s_m":2325.0,"t_s":193.8,"margin_wh":15.97,"nearest_site_id":"L2","e_left_wh":27.21,"e_need_wh":3.24},
        {"s_m":2340.0,"t_s":195.0,"margin_wh":15.83,"nearest_site_id":"L2","e_left_wh":27.19,"e_need_wh":3.36},
        {"s_m":2355.0,"t_s":196.2,"margin_wh":15.68,"nearest_site_id":"L2","e_left_wh":27.17,"e_need_wh":3.49},
        {"s_m":2370.0,"t_s":197.5,"margin_wh":15.53,"nearest_site_id":"L2","e_left_wh":27.16,"e_need_wh":3.63},
        {"s_m":2385.0,"t_s":198.8,"margin_wh":15.37,"nearest_site_id":"L2","e_left_wh":27.14,"e_need_wh":3.77},
        {"s_m":2400.0,"t_s":200.0,"margin_wh":15.21,"nearest_site_id":"L2","e_left_wh":27.12,"e_need_wh":3.91},
        {"s_m":2415.0,"t_s":201.2,"margin_wh":15.05,"nearest_site_id":"L2","e_left_wh":27.1,"e_need_wh":4.05},
        {"s_m":2430.0,"t_s":202.5,"margin_wh":14.89,"nearest_site_id":"L2","e_left_wh":27.08,"e_need_wh":4.2},
        {"s_m":2445.0,"t_s":203.8,"margin_wh":14.73,"nearest_site_id":"L2","e_left_wh":27.07,"e_need_wh":4.34},
        {"s_m":2460.0,"t_s":205.0,"margin_wh":14.56,"nearest_site_id":"L2","e_left_wh":27.05,"e_need_wh":4.49},
        {"s_m":2475.0,"t_s":206.2,"margin_wh":14.4,"nearest_site_id":"L2","e_left_wh":27.03,"e_need_wh":4.63},
        {"s_m":2490.0,"t_s":207.5,"margin_wh":14.23,"nearest_site_id":"L2","e_left_wh":27.01,"e_need_wh":4.78},
        {"s_m":2505.0,"t_s":208.8,"margin_wh":14.07,"nearest_site_id":"L2","e_left_wh":26.99,"e_need_wh":4.93},
        {"s_m":2520.0,"t_s":210.0,"margin_wh":13.9,"nearest_site_id":"L2","e_left_wh":26.98,"e_need_wh":5.07},
        {"s_m":2535.0,"t_s":211.2,"margin_wh":13.74,"nearest_site_id":"L2","e_left_wh":26.96,"e_need_wh":5.22},
        {"s_m":2550.0,"t_s":212.5,"margin_wh":13.57,"nearest_site_id":"L2","e_left_wh":26.94,"e_need_wh":5.37},
        {"s_m":2565.0,"t_s":213.8,"margin_wh":13.4,"nearest_site_id":"L2","e_left_wh":26.92,"e_need_wh":5.52},
        {"s_m":2580.0,"t_s":215.0,"margin_wh":13.24,"nearest_site_id":"L2","e_left_wh":26.9,"e_need_wh":5.67},
        {"s_m":2595.0,"t_s":216.2,"margin_wh":13.07,"nearest_site_id":"L2","e_left_wh":26.89,"e_need_wh":5.82},
        {"s_m":2610.0,"t_s":217.5,"margin_wh":12.9,"nearest_site_id":"L2","e_left_wh":26.87,"e_need_wh":5.96},
        {"s_m":2625.0,"t_s":218.8,"margin_wh":12.74,"nearest_site_id":"L2","e_left_wh":26.85,"e_need_wh":6.11},
        {"s_m":2640.0,"t_s":220.0,"margin_wh":12.57,"nearest_site_id":"L2","e_left_wh":26.83,"e_need_wh":6.26},
        {"s_m":2655.0,"t_s":221.2,"margin_wh":12.4,"nearest_site_id":"L2","e_left_wh":26.81,"e_need_wh":6.41},
        {"s_m":2670.0,"t_s":222.5,"margin_wh":12.24,"nearest_site_id":"L2","e_left_wh":26.8,"e_need_wh":6.56},
        {"s_m":2685.0,"t_s":223.8,"margin_wh":12.07,"nearest_site_id":"L2","e_left_wh":26.78,"e_need_wh":6.71},
        {"s_m":2700.0,"t_s":225.0,"margin_wh":11.9,"nearest_site_id":"L2","e_left_wh":26.76,"e_need_wh":6.86},
        {"s_m":2715.0,"t_s":226.2,"margin_wh":11.74,"nearest_site_id":"L2","e_left_wh":26.74,"e_need_wh":7.01},
        {"s_m":2730.0,"t_s":227.5,"margin_wh":11.57,"nearest_site_id":"L2","e_left_wh":26.72,"e_need_wh":7.16},
        {"s_m":2745.0,"t_s":228.8,"margin_wh":11.4,"nearest_site_id":"L2","e_left_wh":26.71,"e_need_wh":7.31},
        {"s_m":2760.0,"t_s":230.0,"margin_wh":11.23,"nearest_site_id":"L2","e_left_wh":26.69,"e_need_wh":7.45},
        {"s_m":2775.0,"t_s":231.2,"margin_wh":11.07,"nearest_site_id":"L2","e_left_wh":26.67,"e_need_wh":7.6},
        {"s_m":2790.0,"t_s":232.5,"margin_wh":10.9,"nearest_site_id":"L2","e_left_wh":26.65,"e_need_wh":7.75},
        {"s_m":2805.0,"t_s":233.8,"margin_wh":10.73,"nearest_site_id":"L2","e_left_wh":26.63,"e_need_wh":7.9},
        {"s_m":2820.0,"t_s":235.0,"margin_wh":10.56,"nearest_site_id":"L2","e_left_wh":26.62,"e_need_wh":8.05},
        {"s_m":2835.0,"t_s":236.2,"margin_wh":10.4,"nearest_site_id":"L2","e_left_wh":26.6,"e_need_wh":8.2},
        {"s_m":2850.0,"t_s":237.5,"margin_wh":10.23,"nearest_site_id":"L2","e_left_wh":26.58,"e_need_wh":8.35},
        {"s_m":2865.0,"t_s":238.8,"margin_wh":10.06,"nearest_site_id":"L2","e_left_wh":26.56,"e_need_wh":8.5},
        {"s_m":2880.0,"t_s":240.0,"margin_wh":9.89,"nearest_site_id":"L2","e_left_wh":26.54,"e_need_wh":8.65},
        {"s_m":2895.0,"t_s":241.2,"margin_wh":9.73,"nearest_site_id":"L2","e_left_wh":26.53,"e_need_wh":8.8},
        {"s_m":2910.0,"t_s":242.5,"margin_wh":9.56,"nearest_site_id":"L2","e_left_wh":26.51,"e_need_wh":8.95},
        {"s_m":2925.0,"t_s":243.8,"margin_wh":9.39,"nearest_site_id":"L2","e_left_wh":26.49,"e_need_wh":9.1},
        {"s_m":2940.0,"t_s":245.0,"margin_wh":9.22,"nearest_site_id":"L2","e_left_wh":26.47,"e_need_wh":9.25},
        {"s_m":2955.0,"t_s":246.2,"margin_wh":9.06,"nearest_site_id":"L2","e_left_wh":26.45,"e_need_wh":9.4},
        {"s_m":2970.0,"t_s":247.5,"margin_wh":8.89,"nearest_site_id":"L2","e_left_wh":26.44,"e_need_wh":9.55},
        {"s_m":2985.0,"t_s":248.8,"margin_wh":8.72,"nearest_site_id":"L2","e_left_wh":26.42,"e_need_wh":9.7},
        {"s_m":3000.0,"t_s":250.0,"margin_wh":8.55,"nearest_site_id":"L2","e_left_wh":26.4,"e_need_wh":9.85},
        {"s_m":3015.0,"t_s":251.2,"margin_wh":8.38,"nearest_site_id":"L2","e_left_wh":26.38,"e_need_wh":10.0},
        {"s_m":3030.0,"t_s":252.5,"margin_wh":8.22,"nearest_site_id":"L2","e_left_wh":26.36,"e_need_wh":10.15},
        {"s_m":3045.0,"t_s":253.8,"margin_wh":8.05,"nearest_site_id":"L2","e_left_wh":26.35,"e_need_wh":10.3},
        {"s_m":3060.0,"t_s":255.0,"margin_wh":7.88,"nearest_site_id":"L2","e_left_wh":26.33,"e_need_wh":10.45},
        {"s_m":3075.0,"t_s":256.2,"margin_wh":7.71,"nearest_site_id":"L2","e_left_wh":26.31,"e_need_wh":10.6},
        {"s_m":3090.0,"t_s":257.5,"margin_wh":7.55,"nearest_site_id":"L2","e_left_wh":26.29,"e_need_wh":10.75},
        {"s_m":3105.0,"t_s":258.8,"margin_wh":7.38,"nearest_site_id":"L2","e_left_wh":26.27,"e_need_wh":10.9},
        {"s_m":3120.0,"t_s":260.0,"margin_wh":7.21,"nearest_site_id":"L2","e_left_wh":26.26,"e_need_wh":11.05},
        {"s_m":3135.0,"t_s":261.2,"margin_wh":7.04,"nearest_site_id":"L2","e_left_wh":26.24,"e_need_wh":11.2},
        {"s_m":3150.0,"t_s":262.5,"margin_wh":6.87,"nearest_site_id":"L2","e_left_wh":26.22,"e_need_wh":11.35},
        {"s_m":3165.0,"t_s":263.8,"margin_wh":6.71,"nearest_site_id":"L2","e_left_wh":26.2,"e_need_wh":11.5},
        {"s_m":3180.0,"t_s":265.0,"margin_wh":6.54,"nearest_site_id":"L2","e_left_wh":26.18,"e_need_wh":11.65},
        {"s_m":3195.0,"t_s":266.2,"margin_wh":6.37,"nearest_site_id":"L2","e_left_wh":26.17,"e_need_wh":11.8},
        {"s_m":3210.0,"t_s":267.5,"margin_wh":6.2,"nearest_site_id":"L2","e_left_wh":26.15,"e_need_wh":11.94},
        {"s_m":3225.0,"t_s":268.8,"margin_wh":6.04,"nearest_site_id":"L2","e_left_wh":26.13,"e_need_wh":12.09},
        {"s_m":3240.0,"t_s":270.0,"margin_wh":5.87,"nearest_site_id":"L2","e_left_wh":26.11,"e_need_wh":12.24},
        {"s_m":3255.0,"t_s":271.2,"margin_wh":5.7,"nearest_site_id":"L2","e_left_wh":26.09,"e_need_wh":12.39},
        {"s_m":3270.0,"t_s":272.5,"margin_wh":5.53,"nearest_site_id":"L2","e_left_wh":26.08,"e_need_wh":12.54},
        {"s_m":3285.0,"t_s":273.8,"margin_wh":5.36,"nearest_site_id":"L2","e_left_wh":26.06,"e_need_wh":12.69},
        {"s_m":3300.0,"t_s":275.0,"margin_wh":5.2,"nearest_site_id":"L2","e_left_wh":26.04,"e_need_wh":12.84},
        {"s_m":3315.0,"t_s":276.2,"margin_wh":5.03,"nearest_site_id":"L2","e_left_wh":26.02,"e_need_wh":12.99},
        {"s_m":3330.0,"t_s":277.5,"margin_wh":4.86,"nearest_site_id":"L2","e_left_wh":26.0,"e_need_wh":13.14},
        {"s_m":3345.0,"t_s":278.8,"margin_wh":4.69,"nearest_site_id":"L2","e_left_wh":25.99,"e_need_wh":13.29},
        {"s_m":3360.0,"t_s":280.0,"margin_wh":4.52,"nearest_site_id":"L2","e_left_wh":25.97,"e_need_wh":13.44},
        {"s_m":3375.0,"t_s":281.2,"margin_wh":4.36,"nearest_site_id":"L2","e_left_wh":25.95,"e_need_wh":13.59},
        {"s_m":3390.0,"t_s":282.5,"margin_wh":4.19,"nearest_site_id":"L2","e_left_wh":25.93,"e_need_wh":13.74},
        {"s_m":3397.06,"t_s":283.1,"margin_wh":4.11,"nearest_site_id":"L2","e_left_wh":25.92,"e_need_wh":13.81}
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S2-01-B",
      "task_id": "T-S2-01",
      "plan_version": "v2",
      "reserve_wh": 8.0,
      "samples": [
        {"s_m":0.0,"t_s":0.0,"margin_wh":13.84,"nearest_site_id":"L1","e_left_wh":30.0,"e_need_wh":8.16},
        {"s_m":15.0,"t_s":1.2,"margin_wh":13.93,"nearest_site_id":"L1","e_left_wh":29.98,"e_need_wh":8.05},
        {"s_m":30.0,"t_s":2.5,"margin_wh":14.02,"nearest_site_id":"L1","e_left_wh":29.96,"e_need_wh":7.95},
        {"s_m":45.0,"t_s":3.8,"margin_wh":14.1,"nearest_site_id":"L1","e_left_wh":29.95,"e_need_wh":7.85},
        {"s_m":60.0,"t_s":5.0,"margin_wh":14.18,"nearest_site_id":"L1","e_left_wh":29.93,"e_need_wh":7.75},
        {"s_m":75.0,"t_s":6.2,"margin_wh":14.26,"nearest_site_id":"L1","e_left_wh":29.91,"e_need_wh":7.65},
        {"s_m":90.0,"t_s":7.5,"margin_wh":14.33,"nearest_site_id":"L1","e_left_wh":29.89,"e_need_wh":7.56},
        {"s_m":105.0,"t_s":8.8,"margin_wh":14.4,"nearest_site_id":"L1","e_left_wh":29.87,"e_need_wh":7.47},
        {"s_m":120.0,"t_s":10.0,"margin_wh":14.47,"nearest_site_id":"L1","e_left_wh":29.86,"e_need_wh":7.38},
        {"s_m":135.0,"t_s":11.2,"margin_wh":14.54,"nearest_site_id":"L1","e_left_wh":29.84,"e_need_wh":7.3},
        {"s_m":150.0,"t_s":12.5,"margin_wh":14.6,"nearest_site_id":"L1","e_left_wh":29.82,"e_need_wh":7.22},
        {"s_m":165.0,"t_s":13.8,"margin_wh":14.66,"nearest_site_id":"L1","e_left_wh":29.8,"e_need_wh":7.14},
        {"s_m":180.0,"t_s":15.0,"margin_wh":14.72,"nearest_site_id":"L1","e_left_wh":29.78,"e_need_wh":7.07},
        {"s_m":195.0,"t_s":16.2,"margin_wh":14.77,"nearest_site_id":"L1","e_left_wh":29.77,"e_need_wh":6.99},
        {"s_m":210.0,"t_s":17.5,"margin_wh":14.82,"nearest_site_id":"L1","e_left_wh":29.75,"e_need_wh":6.93},
        {"s_m":225.0,"t_s":18.8,"margin_wh":14.86,"nearest_site_id":"L1","e_left_wh":29.73,"e_need_wh":6.87},
        {"s_m":240.0,"t_s":20.0,"margin_wh":14.9,"nearest_site_id":"L1","e_left_wh":29.71,"e_need_wh":6.81},
        {"s_m":255.0,"t_s":21.2,"margin_wh":14.94,"nearest_site_id":"L1","e_left_wh":29.69,"e_need_wh":6.75},
        {"s_m":270.0,"t_s":22.5,"margin_wh":14.97,"nearest_site_id":"L1","e_left_wh":29.68,"e_need_wh":6.71},
        {"s_m":285.0,"t_s":23.8,"margin_wh":15.0,"nearest_site_id":"L1","e_left_wh":29.66,"e_need_wh":6.66},
        {"s_m":300.0,"t_s":25.0,"margin_wh":15.02,"nearest_site_id":"L1","e_left_wh":29.64,"e_need_wh":6.62},
        {"s_m":315.0,"t_s":26.2,"margin_wh":15.03,"nearest_site_id":"L1","e_left_wh":29.62,"e_need_wh":6.59},
        {"s_m":330.0,"t_s":27.5,"margin_wh":15.04,"nearest_site_id":"L1","e_left_wh":29.6,"e_need_wh":6.56},
        {"s_m":345.0,"t_s":28.8,"margin_wh":15.05,"nearest_site_id":"L1","e_left_wh":29.59,"e_need_wh":6.54},
        {"s_m":360.0,"t_s":30.0,"margin_wh":15.05,"nearest_site_id":"L1","e_left_wh":29.57,"e_need_wh":6.52},
        {"s_m":375.0,"t_s":31.2,"margin_wh":15.04,"nearest_site_id":"L1","e_left_wh":29.55,"e_need_wh":6.51},
        {"s_m":390.0,"t_s":32.5,"margin_wh":15.03,"nearest_site_id":"L1","e_left_wh":29.53,"e_need_wh":6.5},
        {"s_m":405.0,"t_s":33.8,"margin_wh":15.01,"nearest_site_id":"L1","e_left_wh":29.51,"e_need_wh":6.5},
        {"s_m":420.0,"t_s":35.0,"margin_wh":14.99,"nearest_site_id":"L1","e_left_wh":29.5,"e_need_wh":6.5},
        {"s_m":435.0,"t_s":36.2,"margin_wh":14.96,"nearest_site_id":"L1","e_left_wh":29.48,"e_need_wh":6.52},
        {"s_m":450.0,"t_s":37.5,"margin_wh":14.93,"nearest_site_id":"L1","e_left_wh":29.46,"e_need_wh":6.53},
        {"s_m":465.0,"t_s":38.8,"margin_wh":14.89,"nearest_site_id":"L1","e_left_wh":29.44,"e_need_wh":6.55},
        {"s_m":480.0,"t_s":40.0,"margin_wh":14.84,"nearest_site_id":"L1","e_left_wh":29.42,"e_need_wh":6.58},
        {"s_m":495.0,"t_s":41.2,"margin_wh":14.79,"nearest_site_id":"L1","e_left_wh":29.41,"e_need_wh":6.61},
        {"s_m":510.0,"t_s":42.5,"margin_wh":14.74,"nearest_site_id":"L1","e_left_wh":29.39,"e_need_wh":6.65},
        {"s_m":525.0,"t_s":43.8,"margin_wh":14.68,"nearest_site_id":"L1","e_left_wh":29.37,"e_need_wh":6.69},
        {"s_m":540.0,"t_s":45.0,"margin_wh":14.61,"nearest_site_id":"L1","e_left_wh":29.35,"e_need_wh":6.74},
        {"s_m":555.0,"t_s":46.2,"margin_wh":14.54,"nearest_site_id":"L1","e_left_wh":29.33,"e_need_wh":6.79},
        {"s_m":570.0,"t_s":47.5,"margin_wh":14.47,"nearest_site_id":"L1","e_left_wh":29.32,"e_need_wh":6.85},
        {"s_m":585.0,"t_s":48.8,"margin_wh":14.39,"nearest_site_id":"L1","e_left_wh":29.3,"e_need_wh":6.91},
        {"s_m":600.0,"t_s":50.0,"margin_wh":14.31,"nearest_site_id":"L1","e_left_wh":29.28,"e_need_wh":6.97},
        {"s_m":615.0,"t_s":51.2,"margin_wh":14.22,"nearest_site_id":"L1","e_left_wh":29.26,"e_need_wh":7.04},
        {"s_m":630.0,"t_s":52.5,"margin_wh":14.13,"nearest_site_id":"L1","e_left_wh":29.24,"e_need_wh":7.11},
        {"s_m":645.0,"t_s":53.8,"margin_wh":14.04,"nearest_site_id":"L1","e_left_wh":29.23,"e_need_wh":7.19},
        {"s_m":660.0,"t_s":55.0,"margin_wh":13.94,"nearest_site_id":"L1","e_left_wh":29.21,"e_need_wh":7.27},
        {"s_m":675.0,"t_s":56.2,"margin_wh":13.84,"nearest_site_id":"L1","e_left_wh":29.19,"e_need_wh":7.35},
        {"s_m":690.0,"t_s":57.5,"margin_wh":13.73,"nearest_site_id":"L1","e_left_wh":29.17,"e_need_wh":7.44},
        {"s_m":705.0,"t_s":58.8,"margin_wh":13.62,"nearest_site_id":"L1","e_left_wh":29.15,"e_need_wh":7.53},
        {"s_m":720.0,"t_s":60.0,"margin_wh":13.51,"nearest_site_id":"L1","e_left_wh":29.14,"e_need_wh":7.62},
        {"s_m":735.0,"t_s":61.2,"margin_wh":13.4,"nearest_site_id":"L1","e_left_wh":29.12,"e_need_wh":7.72},
        {"s_m":750.0,"t_s":62.5,"margin_wh":13.28,"nearest_site_id":"L1","e_left_wh":29.1,"e_need_wh":7.82},
        {"s_m":765.0,"t_s":63.8,"margin_wh":13.17,"nearest_site_id":"L1","e_left_wh":29.08,"e_need_wh":7.92},
        {"s_m":780.0,"t_s":65.0,"margin_wh":13.05,"nearest_site_id":"L1","e_left_wh":29.06,"e_need_wh":8.02},
        {"s_m":795.0,"t_s":66.2,"margin_wh":12.92,"nearest_site_id":"L1","e_left_wh":29.05,"e_need_wh":8.12},
        {"s_m":810.0,"t_s":67.5,"margin_wh":12.8,"nearest_site_id":"L1","e_left_wh":29.03,"e_need_wh":8.23},
        {"s_m":825.0,"t_s":68.8,"margin_wh":12.67,"nearest_site_id":"L1","e_left_wh":29.01,"e_need_wh":8.34},
        {"s_m":840.0,"t_s":70.0,"margin_wh":12.55,"nearest_site_id":"L1","e_left_wh":28.99,"e_need_wh":8.45},
        {"s_m":855.0,"t_s":71.2,"margin_wh":12.42,"nearest_site_id":"L1","e_left_wh":28.97,"e_need_wh":8.56},
        {"s_m":870.0,"t_s":72.5,"margin_wh":12.28,"nearest_site_id":"L1","e_left_wh":28.96,"e_need_wh":8.67},
        {"s_m":885.0,"t_s":73.8,"margin_wh":12.15,"nearest_site_id":"L1","e_left_wh":28.94,"e_need_wh":8.79},
        {"s_m":900.0,"t_s":75.0,"margin_wh":12.02,"nearest_site_id":"L1","e_left_wh":28.92,"e_need_wh":8.9},
        {"s_m":915.0,"t_s":76.2,"margin_wh":11.88,"nearest_site_id":"L1","e_left_wh":28.9,"e_need_wh":9.02},
        {"s_m":930.0,"t_s":77.5,"margin_wh":11.74,"nearest_site_id":"L1","e_left_wh":28.88,"e_need_wh":9.14},
        {"s_m":945.0,"t_s":78.8,"margin_wh":11.61,"nearest_site_id":"L1","e_left_wh":28.87,"e_need_wh":9.26},
        {"s_m":960.0,"t_s":80.0,"margin_wh":11.47,"nearest_site_id":"L1","e_left_wh":28.85,"e_need_wh":9.38},
        {"s_m":975.0,"t_s":81.2,"margin_wh":11.33,"nearest_site_id":"L1","e_left_wh":28.83,"e_need_wh":9.5},
        {"s_m":990.0,"t_s":82.5,"margin_wh":11.18,"nearest_site_id":"L1","e_left_wh":28.81,"e_need_wh":9.63},
        {"s_m":1005.0,"t_s":83.8,"margin_wh":11.04,"nearest_site_id":"L1","e_left_wh":28.79,"e_need_wh":9.75},
        {"s_m":1020.0,"t_s":85.0,"margin_wh":10.9,"nearest_site_id":"L1","e_left_wh":28.78,"e_need_wh":9.88},
        {"s_m":1035.0,"t_s":86.2,"margin_wh":10.75,"nearest_site_id":"L1","e_left_wh":28.76,"e_need_wh":10.0},
        {"s_m":1050.0,"t_s":87.5,"margin_wh":10.61,"nearest_site_id":"L1","e_left_wh":28.74,"e_need_wh":10.13},
        {"s_m":1065.0,"t_s":88.8,"margin_wh":10.46,"nearest_site_id":"L1","e_left_wh":28.72,"e_need_wh":10.26},
        {"s_m":1080.0,"t_s":90.0,"margin_wh":10.31,"nearest_site_id":"L1","e_left_wh":28.7,"e_need_wh":10.39},
        {"s_m":1095.0,"t_s":91.2,"margin_wh":10.17,"nearest_site_id":"L1","e_left_wh":28.69,"e_need_wh":10.52},
        {"s_m":1110.0,"t_s":92.5,"margin_wh":10.02,"nearest_site_id":"L1","e_left_wh":28.67,"e_need_wh":10.65},
        {"s_m":1125.0,"t_s":93.8,"margin_wh":9.87,"nearest_site_id":"L1","e_left_wh":28.65,"e_need_wh":10.78},
        {"s_m":1140.0,"t_s":95.0,"margin_wh":9.72,"nearest_site_id":"L1","e_left_wh":28.63,"e_need_wh":10.91},
        {"s_m":1155.0,"t_s":96.2,"margin_wh":9.57,"nearest_site_id":"L1","e_left_wh":28.61,"e_need_wh":11.04},
        {"s_m":1170.0,"t_s":97.5,"margin_wh":9.42,"nearest_site_id":"L1","e_left_wh":28.6,"e_need_wh":11.18},
        {"s_m":1185.0,"t_s":98.8,"margin_wh":9.27,"nearest_site_id":"L1","e_left_wh":28.58,"e_need_wh":11.31},
        {"s_m":1200.0,"t_s":100.0,"margin_wh":9.12,"nearest_site_id":"L1","e_left_wh":28.56,"e_need_wh":11.44},
        {"s_m":1215.0,"t_s":101.2,"margin_wh":8.96,"nearest_site_id":"L1","e_left_wh":28.54,"e_need_wh":11.58},
        {"s_m":1230.0,"t_s":102.5,"margin_wh":8.81,"nearest_site_id":"L1","e_left_wh":28.52,"e_need_wh":11.71},
        {"s_m":1245.0,"t_s":103.8,"margin_wh":8.66,"nearest_site_id":"L1","e_left_wh":28.51,"e_need_wh":11.85},
        {"s_m":1260.0,"t_s":105.0,"margin_wh":8.5,"nearest_site_id":"L1","e_left_wh":28.49,"e_need_wh":11.98},
        {"s_m":1275.0,"t_s":106.2,"margin_wh":8.35,"nearest_site_id":"L1","e_left_wh":28.47,"e_need_wh":12.12},
        {"s_m":1290.0,"t_s":107.5,"margin_wh":8.19,"nearest_site_id":"L1","e_left_wh":28.45,"e_need_wh":12.26},
        {"s_m":1305.0,"t_s":108.8,"margin_wh":8.04,"nearest_site_id":"L1","e_left_wh":28.43,"e_need_wh":12.39},
        {"s_m":1320.0,"t_s":110.0,"margin_wh":7.88,"nearest_site_id":"L1","e_left_wh":28.42,"e_need_wh":12.53},
        {"s_m":1335.0,"t_s":111.2,"margin_wh":7.73,"nearest_site_id":"L1","e_left_wh":28.4,"e_need_wh":12.67},
        {"s_m":1350.0,"t_s":112.5,"margin_wh":7.57,"nearest_site_id":"L1","e_left_wh":28.38,"e_need_wh":12.81},
        {"s_m":1365.0,"t_s":113.8,"margin_wh":7.42,"nearest_site_id":"L1","e_left_wh":28.36,"e_need_wh":12.95},
        {"s_m":1380.0,"t_s":115.0,"margin_wh":7.26,"nearest_site_id":"L1","e_left_wh":28.34,"e_need_wh":13.08},
        {"s_m":1395.0,"t_s":116.2,"margin_wh":7.1,"nearest_site_id":"L1","e_left_wh":28.33,"e_need_wh":13.22},
        {"s_m":1410.0,"t_s":117.5,"margin_wh":7.13,"nearest_site_id":"L3","e_left_wh":28.31,"e_need_wh":13.18},
        {"s_m":1425.0,"t_s":118.8,"margin_wh":7.25,"nearest_site_id":"L3","e_left_wh":28.29,"e_need_wh":13.04},
        {"s_m":1440.0,"t_s":120.0,"margin_wh":7.37,"nearest_site_id":"L3","e_left_wh":28.27,"e_need_wh":12.9},
        {"s_m":1455.0,"t_s":121.2,"margin_wh":7.49,"nearest_site_id":"L3","e_left_wh":28.25,"e_need_wh":12.76},
        {"s_m":1470.0,"t_s":122.5,"margin_wh":7.61,"nearest_site_id":"L3","e_left_wh":28.24,"e_need_wh":12.62},
        {"s_m":1485.0,"t_s":123.8,"margin_wh":7.73,"nearest_site_id":"L3","e_left_wh":28.22,"e_need_wh":12.49},
        {"s_m":1500.0,"t_s":125.0,"margin_wh":7.85,"nearest_site_id":"L3","e_left_wh":28.2,"e_need_wh":12.35},
        {"s_m":1515.0,"t_s":126.2,"margin_wh":7.97,"nearest_site_id":"L3","e_left_wh":28.18,"e_need_wh":12.21},
        {"s_m":1530.0,"t_s":127.5,"margin_wh":8.09,"nearest_site_id":"L3","e_left_wh":28.16,"e_need_wh":12.08},
        {"s_m":1545.0,"t_s":128.8,"margin_wh":8.21,"nearest_site_id":"L3","e_left_wh":28.15,"e_need_wh":11.94},
        {"s_m":1560.0,"t_s":130.0,"margin_wh":8.32,"nearest_site_id":"L3","e_left_wh":28.13,"e_need_wh":11.8},
        {"s_m":1575.0,"t_s":131.2,"margin_wh":8.44,"nearest_site_id":"L3","e_left_wh":28.11,"e_need_wh":11.67},
        {"s_m":1590.0,"t_s":132.5,"margin_wh":8.56,"nearest_site_id":"L3","e_left_wh":28.09,"e_need_wh":11.53},
        {"s_m":1605.0,"t_s":133.8,"margin_wh":8.67,"nearest_site_id":"L3","e_left_wh":28.07,"e_need_wh":11.4},
        {"s_m":1620.0,"t_s":135.0,"margin_wh":8.79,"nearest_site_id":"L3","e_left_wh":28.06,"e_need_wh":11.27},
        {"s_m":1635.0,"t_s":136.2,"margin_wh":8.91,"nearest_site_id":"L3","e_left_wh":28.04,"e_need_wh":11.13},
        {"s_m":1650.0,"t_s":137.5,"margin_wh":9.02,"nearest_site_id":"L3","e_left_wh":28.02,"e_need_wh":11.0},
        {"s_m":1665.0,"t_s":138.8,"margin_wh":9.13,"nearest_site_id":"L3","e_left_wh":28.0,"e_need_wh":10.87},
        {"s_m":1680.0,"t_s":140.0,"margin_wh":9.25,"nearest_site_id":"L3","e_left_wh":27.98,"e_need_wh":10.74},
        {"s_m":1695.0,"t_s":141.2,"margin_wh":9.36,"nearest_site_id":"L3","e_left_wh":27.97,"e_need_wh":10.61},
        {"s_m":1710.0,"t_s":142.5,"margin_wh":9.47,"nearest_site_id":"L3","e_left_wh":27.95,"e_need_wh":10.48},
        {"s_m":1725.0,"t_s":143.8,"margin_wh":9.58,"nearest_site_id":"L3","e_left_wh":27.93,"e_need_wh":10.35},
        {"s_m":1740.0,"t_s":145.0,"margin_wh":9.69,"nearest_site_id":"L3","e_left_wh":27.91,"e_need_wh":10.22},
        {"s_m":1755.0,"t_s":146.2,"margin_wh":9.79,"nearest_site_id":"L3","e_left_wh":27.89,"e_need_wh":10.11},
        {"s_m":1770.0,"t_s":147.5,"margin_wh":9.85,"nearest_site_id":"L3","e_left_wh":27.88,"e_need_wh":10.03},
        {"s_m":1785.0,"t_s":148.8,"margin_wh":9.9,"nearest_site_id":"L3","e_left_wh":27.86,"e_need_wh":9.95},
        {"s_m":1800.0,"t_s":150.0,"margin_wh":9.96,"nearest_site_id":"L3","e_left_wh":27.84,"e_need_wh":9.88},
        {"s_m":1815.0,"t_s":151.2,"margin_wh":10.01,"nearest_site_id":"L3","e_left_wh":27.82,"e_need_wh":9.81},
        {"s_m":1830.0,"t_s":152.5,"margin_wh":10.06,"nearest_site_id":"L3","e_left_wh":27.8,"e_need_wh":9.74},
        {"s_m":1845.0,"t_s":153.8,"margin_wh":10.11,"nearest_site_id":"L3","e_left_wh":27.79,"e_need_wh":9.68},
        {"s_m":1860.0,"t_s":155.0,"margin_wh":10.15,"nearest_site_id":"L3","e_left_wh":27.77,"e_need_wh":9.62},
        {"s_m":1875.0,"t_s":156.2,"margin_wh":10.19,"nearest_site_id":"L3","e_left_wh":27.75,"e_need_wh":9.56},
        {"s_m":1890.0,"t_s":157.5,"margin_wh":10.23,"nearest_site_id":"L3","e_left_wh":27.73,"e_need_wh":9.5},
        {"s_m":1905.0,"t_s":158.8,"margin_wh":10.27,"nearest_site_id":"L3","e_left_wh":27.71,"e_need_wh":9.45},
        {"s_m":1920.0,"t_s":160.0,"margin_wh":10.3,"nearest_site_id":"L3","e_left_wh":27.7,"e_need_wh":9.39},
        {"s_m":1935.0,"t_s":161.2,"margin_wh":10.33,"nearest_site_id":"L3","e_left_wh":27.68,"e_need_wh":9.35},
        {"s_m":1950.0,"t_s":162.5,"margin_wh":10.36,"nearest_site_id":"L3","e_left_wh":27.66,"e_need_wh":9.3},
        {"s_m":1965.0,"t_s":163.8,"margin_wh":10.38,"nearest_site_id":"L3","e_left_wh":27.64,"e_need_wh":9.26},
        {"s_m":1980.0,"t_s":165.0,"margin_wh":10.41,"nearest_site_id":"L3","e_left_wh":27.62,"e_need_wh":9.22},
        {"s_m":1995.0,"t_s":166.2,"margin_wh":10.42,"nearest_site_id":"L3","e_left_wh":27.61,"e_need_wh":9.18},
        {"s_m":2010.0,"t_s":167.5,"margin_wh":10.44,"nearest_site_id":"L3","e_left_wh":27.59,"e_need_wh":9.15},
        {"s_m":2025.0,"t_s":168.8,"margin_wh":10.45,"nearest_site_id":"L3","e_left_wh":27.57,"e_need_wh":9.12},
        {"s_m":2040.0,"t_s":170.0,"margin_wh":10.46,"nearest_site_id":"L3","e_left_wh":27.55,"e_need_wh":9.09},
        {"s_m":2055.0,"t_s":171.2,"margin_wh":10.46,"nearest_site_id":"L3","e_left_wh":27.53,"e_need_wh":9.07},
        {"s_m":2070.0,"t_s":172.5,"margin_wh":10.47,"nearest_site_id":"L3","e_left_wh":27.52,"e_need_wh":9.05},
        {"s_m":2085.0,"t_s":173.8,"margin_wh":10.47,"nearest_site_id":"L3","e_left_wh":27.5,"e_need_wh":9.03},
        {"s_m":2100.0,"t_s":175.0,"margin_wh":10.46,"nearest_site_id":"L3","e_left_wh":27.48,"e_need_wh":9.02},
        {"s_m":2115.0,"t_s":176.2,"margin_wh":10.45,"nearest_site_id":"L3","e_left_wh":27.46,"e_need_wh":9.01},
        {"s_m":2130.0,"t_s":177.5,"margin_wh":10.44,"nearest_site_id":"L3","e_left_wh":27.44,"e_need_wh":9.0},
        {"s_m":2145.0,"t_s":178.8,"margin_wh":10.43,"nearest_site_id":"L3","e_left_wh":27.43,"e_need_wh":9.0},
        {"s_m":2160.0,"t_s":180.0,"margin_wh":10.41,"nearest_site_id":"L3","e_left_wh":27.41,"e_need_wh":9.0},
        {"s_m":2175.0,"t_s":181.2,"margin_wh":10.39,"nearest_site_id":"L3","e_left_wh":27.39,"e_need_wh":9.0},
        {"s_m":2190.0,"t_s":182.5,"margin_wh":10.36,"nearest_site_id":"L3","e_left_wh":27.37,"e_need_wh":9.01},
        {"s_m":2205.0,"t_s":183.8,"margin_wh":10.33,"nearest_site_id":"L3","e_left_wh":27.35,"e_need_wh":9.02},
        {"s_m":2220.0,"t_s":185.0,"margin_wh":10.3,"nearest_site_id":"L3","e_left_wh":27.34,"e_need_wh":9.04},
        {"s_m":2235.0,"t_s":186.2,"margin_wh":10.26,"nearest_site_id":"L3","e_left_wh":27.32,"e_need_wh":9.06},
        {"s_m":2250.0,"t_s":187.5,"margin_wh":10.22,"nearest_site_id":"L3","e_left_wh":27.3,"e_need_wh":9.08},
        {"s_m":2265.0,"t_s":188.8,"margin_wh":10.18,"nearest_site_id":"L3","e_left_wh":27.28,"e_need_wh":9.1},
        {"s_m":2280.0,"t_s":190.0,"margin_wh":10.14,"nearest_site_id":"L3","e_left_wh":27.26,"e_need_wh":9.13},
        {"s_m":2295.0,"t_s":191.2,"margin_wh":10.09,"nearest_site_id":"L3","e_left_wh":27.25,"e_need_wh":9.16},
        {"s_m":2310.0,"t_s":192.5,"margin_wh":10.03,"nearest_site_id":"L3","e_left_wh":27.23,"e_need_wh":9.19},
        {"s_m":2325.0,"t_s":193.8,"margin_wh":9.98,"nearest_site_id":"L3","e_left_wh":27.21,"e_need_wh":9.23},
        {"s_m":2340.0,"t_s":195.0,"margin_wh":9.92,"nearest_site_id":"L3","e_left_wh":27.19,"e_need_wh":9.27},
        {"s_m":2355.0,"t_s":196.2,"margin_wh":9.86,"nearest_site_id":"L3","e_left_wh":27.17,"e_need_wh":9.32},
        {"s_m":2370.0,"t_s":197.5,"margin_wh":9.79,"nearest_site_id":"L3","e_left_wh":27.16,"e_need_wh":9.36},
        {"s_m":2385.0,"t_s":198.8,"margin_wh":9.73,"nearest_site_id":"L3","e_left_wh":27.14,"e_need_wh":9.41},
        {"s_m":2400.0,"t_s":200.0,"margin_wh":9.66,"nearest_site_id":"L3","e_left_wh":27.12,"e_need_wh":9.46},
        {"s_m":2415.0,"t_s":201.2,"margin_wh":9.58,"nearest_site_id":"L3","e_left_wh":27.1,"e_need_wh":9.52},
        {"s_m":2430.0,"t_s":202.5,"margin_wh":9.51,"nearest_site_id":"L3","e_left_wh":27.08,"e_need_wh":9.58},
        {"s_m":2445.0,"t_s":203.8,"margin_wh":9.43,"nearest_site_id":"L3","e_left_wh":27.07,"e_need_wh":9.64},
        {"s_m":2460.0,"t_s":205.0,"margin_wh":9.35,"nearest_site_id":"L3","e_left_wh":27.05,"e_need_wh":9.7},
        {"s_m":2475.0,"t_s":206.2,"margin_wh":9.26,"nearest_site_id":"L3","e_left_wh":27.03,"e_need_wh":9.77},
        {"s_m":2490.0,"t_s":207.5,"margin_wh":9.18,"nearest_site_id":"L3","e_left_wh":27.01,"e_need_wh":9.84},
        {"s_m":2505.0,"t_s":208.8,"margin_wh":9.09,"nearest_site_id":"L3","e_left_wh":26.99,"e_need_wh":9.91},
        {"s_m":2520.0,"t_s":210.0,"margin_wh":9.0,"nearest_site_id":"L3","e_left_wh":26.98,"e_need_wh":9.98},
        {"s_m":2535.0,"t_s":211.2,"margin_wh":8.9,"nearest_site_id":"L3","e_left_wh":26.96,"e_need_wh":10.05},
        {"s_m":2550.0,"t_s":212.5,"margin_wh":8.81,"nearest_site_id":"L3","e_left_wh":26.94,"e_need_wh":10.13},
        {"s_m":2565.0,"t_s":213.8,"margin_wh":8.71,"nearest_site_id":"L3","e_left_wh":26.92,"e_need_wh":10.21},
        {"s_m":2580.0,"t_s":215.0,"margin_wh":8.61,"nearest_site_id":"L3","e_left_wh":26.9,"e_need_wh":10.29},
        {"s_m":2595.0,"t_s":216.2,"margin_wh":8.69,"nearest_site_id":"L2","e_left_wh":26.89,"e_need_wh":10.2},
        {"s_m":2610.0,"t_s":217.5,"margin_wh":8.82,"nearest_site_id":"L2","e_left_wh":26.87,"e_need_wh":10.05},
        {"s_m":2625.0,"t_s":218.8,"margin_wh":8.95,"nearest_site_id":"L2","e_left_wh":26.85,"e_need_wh":9.9},
        {"s_m":2640.0,"t_s":220.0,"margin_wh":9.08,"nearest_site_id":"L2","e_left_wh":26.83,"e_need_wh":9.76},
        {"s_m":2655.0,"t_s":221.2,"margin_wh":9.2,"nearest_site_id":"L2","e_left_wh":26.81,"e_need_wh":9.61},
        {"s_m":2670.0,"t_s":222.5,"margin_wh":9.33,"nearest_site_id":"L2","e_left_wh":26.8,"e_need_wh":9.46},
        {"s_m":2685.0,"t_s":223.8,"margin_wh":9.46,"nearest_site_id":"L2","e_left_wh":26.78,"e_need_wh":9.32},
        {"s_m":2700.0,"t_s":225.0,"margin_wh":9.59,"nearest_site_id":"L2","e_left_wh":26.76,"e_need_wh":9.17},
        {"s_m":2715.0,"t_s":226.2,"margin_wh":9.72,"nearest_site_id":"L2","e_left_wh":26.74,"e_need_wh":9.02},
        {"s_m":2730.0,"t_s":227.5,"margin_wh":9.85,"nearest_site_id":"L2","e_left_wh":26.72,"e_need_wh":8.88},
        {"s_m":2745.0,"t_s":228.8,"margin_wh":9.97,"nearest_site_id":"L2","e_left_wh":26.71,"e_need_wh":8.73},
        {"s_m":2760.0,"t_s":230.0,"margin_wh":10.1,"nearest_site_id":"L2","e_left_wh":26.69,"e_need_wh":8.59},
        {"s_m":2775.0,"t_s":231.2,"margin_wh":10.23,"nearest_site_id":"L2","e_left_wh":26.67,"e_need_wh":8.44},
        {"s_m":2790.0,"t_s":232.5,"margin_wh":10.35,"nearest_site_id":"L2","e_left_wh":26.65,"e_need_wh":8.3},
        {"s_m":2805.0,"t_s":233.8,"margin_wh":10.48,"nearest_site_id":"L2","e_left_wh":26.63,"e_need_wh":8.15},
        {"s_m":2820.0,"t_s":235.0,"margin_wh":10.61,"nearest_site_id":"L2","e_left_wh":26.62,"e_need_wh":8.01},
        {"s_m":2835.0,"t_s":236.2,"margin_wh":10.73,"nearest_site_id":"L2","e_left_wh":26.6,"e_need_wh":7.86},
        {"s_m":2850.0,"t_s":237.5,"margin_wh":10.86,"nearest_site_id":"L2","e_left_wh":26.58,"e_need_wh":7.72},
        {"s_m":2865.0,"t_s":238.8,"margin_wh":10.99,"nearest_site_id":"L2","e_left_wh":26.56,"e_need_wh":7.58},
        {"s_m":2880.0,"t_s":240.0,"margin_wh":11.11,"nearest_site_id":"L2","e_left_wh":26.54,"e_need_wh":7.43},
        {"s_m":2895.0,"t_s":241.2,"margin_wh":11.24,"nearest_site_id":"L2","e_left_wh":26.53,"e_need_wh":7.29},
        {"s_m":2910.0,"t_s":242.5,"margin_wh":11.36,"nearest_site_id":"L2","e_left_wh":26.51,"e_need_wh":7.15},
        {"s_m":2925.0,"t_s":243.8,"margin_wh":11.48,"nearest_site_id":"L2","e_left_wh":26.49,"e_need_wh":7.01},
        {"s_m":2940.0,"t_s":245.0,"margin_wh":11.61,"nearest_site_id":"L2","e_left_wh":26.47,"e_need_wh":6.87},
        {"s_m":2955.0,"t_s":246.2,"margin_wh":11.73,"nearest_site_id":"L2","e_left_wh":26.45,"e_need_wh":6.73},
        {"s_m":2970.0,"t_s":247.5,"margin_wh":11.85,"nearest_site_id":"L2","e_left_wh":26.44,"e_need_wh":6.59},
        {"s_m":2985.0,"t_s":248.8,"margin_wh":11.97,"nearest_site_id":"L2","e_left_wh":26.42,"e_need_wh":6.45},
        {"s_m":3000.0,"t_s":250.0,"margin_wh":12.09,"nearest_site_id":"L2","e_left_wh":26.4,"e_need_wh":6.31},
        {"s_m":3015.0,"t_s":251.2,"margin_wh":12.21,"nearest_site_id":"L2","e_left_wh":26.38,"e_need_wh":6.17},
        {"s_m":3030.0,"t_s":252.5,"margin_wh":12.33,"nearest_site_id":"L2","e_left_wh":26.36,"e_need_wh":6.03},
        {"s_m":3045.0,"t_s":253.8,"margin_wh":12.45,"nearest_site_id":"L2","e_left_wh":26.35,"e_need_wh":5.9},
        {"s_m":3060.0,"t_s":255.0,"margin_wh":12.56,"nearest_site_id":"L2","e_left_wh":26.33,"e_need_wh":5.76},
        {"s_m":3075.0,"t_s":256.2,"margin_wh":12.68,"nearest_site_id":"L2","e_left_wh":26.31,"e_need_wh":5.63},
        {"s_m":3090.0,"t_s":257.5,"margin_wh":12.79,"nearest_site_id":"L2","e_left_wh":26.29,"e_need_wh":5.5},
        {"s_m":3105.0,"t_s":258.8,"margin_wh":12.9,"nearest_site_id":"L2","e_left_wh":26.27,"e_need_wh":5.37},
        {"s_m":3120.0,"t_s":260.0,"margin_wh":13.01,"nearest_site_id":"L2","e_left_wh":26.26,"e_need_wh":5.25},
        {"s_m":3135.0,"t_s":261.2,"margin_wh":13.12,"nearest_site_id":"L2","e_left_wh":26.24,"e_need_wh":5.12},
        {"s_m":3150.0,"t_s":262.5,"margin_wh":13.22,"nearest_site_id":"L2","e_left_wh":26.22,"e_need_wh":5.0},
        {"s_m":3165.0,"t_s":263.8,"margin_wh":13.32,"nearest_site_id":"L2","e_left_wh":26.2,"e_need_wh":4.88},
        {"s_m":3180.0,"t_s":265.0,"margin_wh":13.42,"nearest_site_id":"L2","e_left_wh":26.18,"e_need_wh":4.77},
        {"s_m":3195.0,"t_s":266.2,"margin_wh":13.51,"nearest_site_id":"L2","e_left_wh":26.17,"e_need_wh":4.66},
        {"s_m":3210.0,"t_s":267.5,"margin_wh":13.6,"nearest_site_id":"L2","e_left_wh":26.15,"e_need_wh":4.55},
        {"s_m":3225.0,"t_s":268.8,"margin_wh":13.68,"nearest_site_id":"L2","e_left_wh":26.13,"e_need_wh":4.45},
        {"s_m":3240.0,"t_s":270.0,"margin_wh":13.75,"nearest_site_id":"L2","e_left_wh":26.11,"e_need_wh":4.36},
        {"s_m":3255.0,"t_s":271.2,"margin_wh":13.82,"nearest_site_id":"L2","e_left_wh":26.09,"e_need_wh":4.28},
        {"s_m":3270.0,"t_s":272.5,"margin_wh":13.88,"nearest_site_id":"L2","e_left_wh":26.08,"e_need_wh":4.2},
        {"s_m":3285.0,"t_s":273.8,"margin_wh":13.92,"nearest_site_id":"L2","e_left_wh":26.06,"e_need_wh":4.13},
        {"s_m":3300.0,"t_s":275.0,"margin_wh":13.96,"nearest_site_id":"L2","e_left_wh":26.04,"e_need_wh":4.08},
        {"s_m":3315.0,"t_s":276.2,"margin_wh":13.98,"nearest_site_id":"L2","e_left_wh":26.02,"e_need_wh":4.04},
        {"s_m":3330.0,"t_s":277.5,"margin_wh":13.99,"nearest_site_id":"L2","e_left_wh":26.0,"e_need_wh":4.01},
        {"s_m":3345.0,"t_s":278.8,"margin_wh":13.99,"nearest_site_id":"L2","e_left_wh":25.99,"e_need_wh":4.0},
        {"s_m":3360.0,"t_s":280.0,"margin_wh":13.96,"nearest_site_id":"L2","e_left_wh":25.97,"e_need_wh":4.0},
        {"s_m":3375.0,"t_s":281.2,"margin_wh":13.93,"nearest_site_id":"L2","e_left_wh":25.95,"e_need_wh":4.02},
        {"s_m":3390.0,"t_s":282.5,"margin_wh":13.88,"nearest_site_id":"L2","e_left_wh":25.93,"e_need_wh":4.05},
        {"s_m":3405.0,"t_s":283.8,"margin_wh":13.82,"nearest_site_id":"L2","e_left_wh":25.91,"e_need_wh":4.1},
        {"s_m":3420.0,"t_s":285.0,"margin_wh":13.74,"nearest_site_id":"L2","e_left_wh":25.9,"e_need_wh":4.16},
        {"s_m":3435.0,"t_s":286.2,"margin_wh":13.65,"nearest_site_id":"L2","e_left_wh":25.88,"e_need_wh":4.22},
        {"s_m":3450.0,"t_s":287.5,"margin_wh":13.56,"nearest_site_id":"L2","e_left_wh":25.86,"e_need_wh":4.3},
        {"s_m":3465.0,"t_s":288.8,"margin_wh":13.45,"nearest_site_id":"L2","e_left_wh":25.84,"e_need_wh":4.39},
        {"s_m":3480.0,"t_s":290.0,"margin_wh":13.34,"nearest_site_id":"L2","e_left_wh":25.82,"e_need_wh":4.48},
        {"s_m":3495.0,"t_s":291.2,"margin_wh":13.22,"nearest_site_id":"L2","e_left_wh":25.81,"e_need_wh":4.59},
        {"s_m":3510.0,"t_s":292.5,"margin_wh":13.09,"nearest_site_id":"L2","e_left_wh":25.79,"e_need_wh":4.69},
        {"s_m":3525.0,"t_s":293.8,"margin_wh":12.97,"nearest_site_id":"L2","e_left_wh":25.77,"e_need_wh":4.8},
        {"s_m":3540.0,"t_s":295.0,"margin_wh":12.83,"nearest_site_id":"L2","e_left_wh":25.75,"e_need_wh":4.92},
        {"s_m":3555.0,"t_s":296.2,"margin_wh":12.69,"nearest_site_id":"L2","e_left_wh":25.73,"e_need_wh":5.04},
        {"s_m":3570.0,"t_s":297.5,"margin_wh":12.55,"nearest_site_id":"L2","e_left_wh":25.72,"e_need_wh":5.16},
        {"s_m":3585.0,"t_s":298.8,"margin_wh":12.41,"nearest_site_id":"L2","e_left_wh":25.7,"e_need_wh":5.29},
        {"s_m":3600.0,"t_s":300.0,"margin_wh":12.26,"nearest_site_id":"L2","e_left_wh":25.68,"e_need_wh":5.42},
        {"s_m":3615.0,"t_s":301.2,"margin_wh":12.12,"nearest_site_id":"L2","e_left_wh":25.66,"e_need_wh":5.55},
        {"s_m":3630.0,"t_s":302.5,"margin_wh":11.97,"nearest_site_id":"L2","e_left_wh":25.64,"e_need_wh":5.68},
        {"s_m":3645.0,"t_s":303.8,"margin_wh":11.82,"nearest_site_id":"L2","e_left_wh":25.63,"e_need_wh":5.81},
        {"s_m":3660.0,"t_s":305.0,"margin_wh":11.66,"nearest_site_id":"L2","e_left_wh":25.61,"e_need_wh":5.94},
        {"s_m":3675.0,"t_s":306.2,"margin_wh":11.51,"nearest_site_id":"L2","e_left_wh":25.59,"e_need_wh":6.08},
        {"s_m":3690.0,"t_s":307.5,"margin_wh":11.36,"nearest_site_id":"L2","e_left_wh":25.57,"e_need_wh":6.22},
        {"s_m":3705.0,"t_s":308.8,"margin_wh":11.2,"nearest_site_id":"L2","e_left_wh":25.55,"e_need_wh":6.35},
        {"s_m":3720.0,"t_s":310.0,"margin_wh":11.04,"nearest_site_id":"L2","e_left_wh":25.54,"e_need_wh":6.49},
        {"s_m":3735.0,"t_s":311.2,"margin_wh":10.89,"nearest_site_id":"L2","e_left_wh":25.52,"e_need_wh":6.63},
        {"s_m":3750.0,"t_s":312.5,"margin_wh":10.73,"nearest_site_id":"L2","e_left_wh":25.5,"e_need_wh":6.77},
        {"s_m":3765.0,"t_s":313.8,"margin_wh":10.57,"nearest_site_id":"L2","e_left_wh":25.48,"e_need_wh":6.91},
        {"s_m":3780.0,"t_s":315.0,"margin_wh":10.41,"nearest_site_id":"L2","e_left_wh":25.46,"e_need_wh":7.05},
        {"s_m":3795.0,"t_s":316.2,"margin_wh":10.25,"nearest_site_id":"L2","e_left_wh":25.45,"e_need_wh":7.2},
        {"s_m":3810.0,"t_s":317.5,"margin_wh":10.09,"nearest_site_id":"L2","e_left_wh":25.43,"e_need_wh":7.34},
        {"s_m":3825.0,"t_s":318.8,"margin_wh":9.93,"nearest_site_id":"L2","e_left_wh":25.41,"e_need_wh":7.48},
        {"s_m":3840.0,"t_s":320.0,"margin_wh":9.77,"nearest_site_id":"L2","e_left_wh":25.39,"e_need_wh":7.62},
        {"s_m":3855.0,"t_s":321.2,"margin_wh":9.61,"nearest_site_id":"L2","e_left_wh":25.37,"e_need_wh":7.77},
        {"s_m":3870.0,"t_s":322.5,"margin_wh":9.44,"nearest_site_id":"L2","e_left_wh":25.36,"e_need_wh":7.91},
        {"s_m":3885.0,"t_s":323.8,"margin_wh":9.28,"nearest_site_id":"L2","e_left_wh":25.34,"e_need_wh":8.06},
        {"s_m":3900.0,"t_s":325.0,"margin_wh":9.12,"nearest_site_id":"L2","e_left_wh":25.32,"e_need_wh":8.2},
        {"s_m":3915.0,"t_s":326.2,"margin_wh":8.96,"nearest_site_id":"L2","e_left_wh":25.3,"e_need_wh":8.35},
        {"s_m":3930.0,"t_s":327.5,"margin_wh":8.79,"nearest_site_id":"L2","e_left_wh":25.28,"e_need_wh":8.49},
        {"s_m":3945.0,"t_s":328.8,"margin_wh":8.63,"nearest_site_id":"L2","e_left_wh":25.27,"e_need_wh":8.64},
        {"s_m":3960.0,"t_s":330.0,"margin_wh":8.47,"nearest_site_id":"L2","e_left_wh":25.25,"e_need_wh":8.78},
        {"s_m":3975.0,"t_s":331.2,"margin_wh":8.3,"nearest_site_id":"L2","e_left_wh":25.23,"e_need_wh":8.93},
        {"s_m":3990.0,"t_s":332.5,"margin_wh":8.14,"nearest_site_id":"L2","e_left_wh":25.21,"e_need_wh":9.07},
        {"s_m":4005.0,"t_s":333.8,"margin_wh":7.97,"nearest_site_id":"L2","e_left_wh":25.19,"e_need_wh":9.22},
        {"s_m":4020.0,"t_s":335.0,"margin_wh":7.81,"nearest_site_id":"L2","e_left_wh":25.18,"e_need_wh":9.37},
        {"s_m":4035.0,"t_s":336.2,"margin_wh":7.65,"nearest_site_id":"L2","e_left_wh":25.16,"e_need_wh":9.51},
        {"s_m":4050.0,"t_s":337.5,"margin_wh":7.48,"nearest_site_id":"L2","e_left_wh":25.14,"e_need_wh":9.66},
        {"s_m":4065.0,"t_s":338.8,"margin_wh":7.32,"nearest_site_id":"L2","e_left_wh":25.12,"e_need_wh":9.81},
        {"s_m":4080.0,"t_s":340.0,"margin_wh":7.15,"nearest_site_id":"L2","e_left_wh":25.1,"e_need_wh":9.95},
        {"s_m":4095.0,"t_s":341.2,"margin_wh":6.99,"nearest_site_id":"L2","e_left_wh":25.09,"e_need_wh":10.1},
        {"s_m":4110.0,"t_s":342.5,"margin_wh":6.82,"nearest_site_id":"L2","e_left_wh":25.07,"e_need_wh":10.25},
        {"s_m":4125.0,"t_s":343.8,"margin_wh":6.66,"nearest_site_id":"L2","e_left_wh":25.05,"e_need_wh":10.39},
        {"s_m":4140.0,"t_s":345.0,"margin_wh":6.49,"nearest_site_id":"L2","e_left_wh":25.03,"e_need_wh":10.54},
        {"s_m":4155.0,"t_s":346.2,"margin_wh":6.37,"nearest_site_id":"L2","e_left_wh":25.01,"e_need_wh":10.65},
        {"s_m":4170.0,"t_s":347.5,"margin_wh":6.32,"nearest_site_id":"L2","e_left_wh":25.0,"e_need_wh":10.68},
        {"s_m":4185.0,"t_s":348.8,"margin_wh":6.27,"nearest_site_id":"L2","e_left_wh":24.98,"e_need_wh":10.71},
        {"s_m":4200.0,"t_s":350.0,"margin_wh":6.21,"nearest_site_id":"L2","e_left_wh":24.96,"e_need_wh":10.75},
        {"s_m":4215.0,"t_s":351.2,"margin_wh":6.16,"nearest_site_id":"L2","e_left_wh":24.94,"e_need_wh":10.78},
        {"s_m":4230.0,"t_s":352.5,"margin_wh":6.1,"nearest_site_id":"L2","e_left_wh":24.92,"e_need_wh":10.82},
        {"s_m":4245.0,"t_s":353.8,"margin_wh":6.04,"nearest_site_id":"L2","e_left_wh":24.91,"e_need_wh":10.87},
        {"s_m":4260.0,"t_s":355.0,"margin_wh":5.98,"nearest_site_id":"L2","e_left_wh":24.89,"e_need_wh":10.91},
        {"s_m":4275.0,"t_s":356.2,"margin_wh":5.91,"nearest_site_id":"L2","e_left_wh":24.87,"e_need_wh":10.96},
        {"s_m":4290.0,"t_s":357.5,"margin_wh":5.84,"nearest_site_id":"L2","e_left_wh":24.85,"e_need_wh":11.01},
        {"s_m":4305.0,"t_s":358.8,"margin_wh":5.77,"nearest_site_id":"L2","e_left_wh":24.83,"e_need_wh":11.06},
        {"s_m":4320.0,"t_s":360.0,"margin_wh":5.7,"nearest_site_id":"L2","e_left_wh":24.82,"e_need_wh":11.12},
        {"s_m":4335.0,"t_s":361.2,"margin_wh":5.62,"nearest_site_id":"L2","e_left_wh":24.8,"e_need_wh":11.17},
        {"s_m":4350.0,"t_s":362.5,"margin_wh":5.55,"nearest_site_id":"L2","e_left_wh":24.78,"e_need_wh":11.23},
        {"s_m":4365.0,"t_s":363.8,"margin_wh":5.47,"nearest_site_id":"L2","e_left_wh":24.76,"e_need_wh":11.29},
        {"s_m":4380.0,"t_s":365.0,"margin_wh":5.39,"nearest_site_id":"L2","e_left_wh":24.74,"e_need_wh":11.36},
        {"s_m":4395.0,"t_s":366.2,"margin_wh":5.3,"nearest_site_id":"L2","e_left_wh":24.73,"e_need_wh":11.42},
        {"s_m":4410.0,"t_s":367.5,"margin_wh":5.22,"nearest_site_id":"L2","e_left_wh":24.71,"e_need_wh":11.49},
        {"s_m":4425.0,"t_s":368.8,"margin_wh":5.13,"nearest_site_id":"L2","e_left_wh":24.69,"e_need_wh":11.56},
        {"s_m":4440.0,"t_s":370.0,"margin_wh":5.04,"nearest_site_id":"L2","e_left_wh":24.67,"e_need_wh":11.63},
        {"s_m":4455.0,"t_s":371.2,"margin_wh":4.95,"nearest_site_id":"L2","e_left_wh":24.65,"e_need_wh":11.7},
        {"s_m":4470.0,"t_s":372.5,"margin_wh":4.86,"nearest_site_id":"L2","e_left_wh":24.64,"e_need_wh":11.78},
        {"s_m":4485.0,"t_s":373.8,"margin_wh":4.76,"nearest_site_id":"L2","e_left_wh":24.62,"e_need_wh":11.86},
        {"s_m":4500.0,"t_s":375.0,"margin_wh":4.67,"nearest_site_id":"L2","e_left_wh":24.6,"e_need_wh":11.93},
        {"s_m":4515.0,"t_s":376.2,"margin_wh":4.57,"nearest_site_id":"L2","e_left_wh":24.58,"e_need_wh":12.01},
        {"s_m":4530.0,"t_s":377.5,"margin_wh":4.47,"nearest_site_id":"L2","e_left_wh":24.56,"e_need_wh":12.1},
        {"s_m":4545.0,"t_s":378.8,"margin_wh":4.37,"nearest_site_id":"L2","e_left_wh":24.55,"e_need_wh":12.18},
        {"s_m":4560.0,"t_s":380.0,"margin_wh":4.26,"nearest_site_id":"L2","e_left_wh":24.53,"e_need_wh":12.27},
        {"s_m":4575.0,"t_s":381.2,"margin_wh":4.16,"nearest_site_id":"L2","e_left_wh":24.51,"e_need_wh":12.35},
        {"s_m":4590.0,"t_s":382.5,"margin_wh":4.05,"nearest_site_id":"L2","e_left_wh":24.49,"e_need_wh":12.44},
        {"s_m":4605.0,"t_s":383.8,"margin_wh":3.94,"nearest_site_id":"L2","e_left_wh":24.47,"e_need_wh":12.53},
        {"s_m":4620.0,"t_s":385.0,"margin_wh":3.83,"nearest_site_id":"L2","e_left_wh":24.46,"e_need_wh":12.62},
        {"s_m":4635.0,"t_s":386.2,"margin_wh":3.72,"nearest_site_id":"L2","e_left_wh":24.44,"e_need_wh":12.71},
        {"s_m":4650.0,"t_s":387.5,"margin_wh":3.61,"nearest_site_id":"L2","e_left_wh":24.42,"e_need_wh":12.81},
        {"s_m":4665.0,"t_s":388.8,"margin_wh":3.5,"nearest_site_id":"L2","e_left_wh":24.4,"e_need_wh":12.9},
        {"s_m":4680.0,"t_s":390.0,"margin_wh":3.38,"nearest_site_id":"L2","e_left_wh":24.38,"e_need_wh":13.0},
        {"s_m":4695.0,"t_s":391.2,"margin_wh":3.27,"nearest_site_id":"L2","e_left_wh":24.37,"e_need_wh":13.1},
        {"s_m":4710.0,"t_s":392.5,"margin_wh":3.15,"nearest_site_id":"L2","e_left_wh":24.35,"e_need_wh":13.2},
        {"s_m":4725.0,"t_s":393.8,"margin_wh":3.03,"nearest_site_id":"L2","e_left_wh":24.33,"e_need_wh":13.3},
        {"s_m":4740.0,"t_s":395.0,"margin_wh":2.91,"nearest_site_id":"L2","e_left_wh":24.31,"e_need_wh":13.4},
        {"s_m":4755.0,"t_s":396.2,"margin_wh":2.79,"nearest_site_id":"L2","e_left_wh":24.29,"e_need_wh":13.5},
        {"s_m":4770.0,"t_s":397.5,"margin_wh":2.67,"nearest_site_id":"L2","e_left_wh":24.28,"e_need_wh":13.6},
        {"s_m":4785.0,"t_s":398.8,"margin_wh":2.55,"nearest_site_id":"L2","e_left_wh":24.26,"e_need_wh":13.71},
        {"s_m":4800.0,"t_s":400.0,"margin_wh":2.43,"nearest_site_id":"L2","e_left_wh":24.24,"e_need_wh":13.81}
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S1-01-A",
      "task_id": "T-S1-01",
      "plan_version": "v1",
      "reserve_wh": 8.0,
      "samples": [
        {"s_m":0.0,"t_s":0.0,"margin_wh":11.72,"nearest_site_id":"L1","e_left_wh":30.0,"e_need_wh":10.28},
        {"s_m":15.0,"t_s":1.2,"margin_wh":11.85,"nearest_site_id":"L1","e_left_wh":29.98,"e_need_wh":10.13},
        {"s_m":30.0,"t_s":2.5,"margin_wh":11.99,"nearest_site_id":"L1","e_left_wh":29.96,"e_need_wh":9.98},
        {"s_m":45.0,"t_s":3.8,"margin_wh":12.12,"nearest_site_id":"L1","e_left_wh":29.95,"e_need_wh":9.83},
        {"s_m":60.0,"t_s":5.0,"margin_wh":12.25,"nearest_site_id":"L1","e_left_wh":29.93,"e_need_wh":9.68},
        {"s_m":75.0,"t_s":6.2,"margin_wh":12.38,"nearest_site_id":"L1","e_left_wh":29.91,"e_need_wh":9.53},
        {"s_m":90.0,"t_s":7.5,"margin_wh":12.51,"nearest_site_id":"L1","e_left_wh":29.89,"e_need_wh":9.38},
        {"s_m":105.0,"t_s":8.8,"margin_wh":12.64,"nearest_site_id":"L1","e_left_wh":29.87,"e_need_wh":9.23},
        {"s_m":120.0,"t_s":10.0,"margin_wh":12.78,"nearest_site_id":"L1","e_left_wh":29.86,"e_need_wh":9.08},
        {"s_m":135.0,"t_s":11.2,"margin_wh":12.91,"nearest_site_id":"L1","e_left_wh":29.84,"e_need_wh":8.93},
        {"s_m":150.0,"t_s":12.5,"margin_wh":13.04,"nearest_site_id":"L1","e_left_wh":29.82,"e_need_wh":8.78},
        {"s_m":165.0,"t_s":13.8,"margin_wh":13.17,"nearest_site_id":"L1","e_left_wh":29.8,"e_need_wh":8.63},
        {"s_m":180.0,"t_s":15.0,"margin_wh":13.3,"nearest_site_id":"L1","e_left_wh":29.78,"e_need_wh":8.48},
        {"s_m":195.0,"t_s":16.2,"margin_wh":13.44,"nearest_site_id":"L1","e_left_wh":29.77,"e_need_wh":8.33},
        {"s_m":210.0,"t_s":17.5,"margin_wh":13.57,"nearest_site_id":"L1","e_left_wh":29.75,"e_need_wh":8.18},
        {"s_m":225.0,"t_s":18.8,"margin_wh":13.7,"nearest_site_id":"L1","e_left_wh":29.73,"e_need_wh":8.03},
        {"s_m":240.0,"t_s":20.0,"margin_wh":13.83,"nearest_site_id":"L1","e_left_wh":29.71,"e_need_wh":7.88},
        {"s_m":255.0,"t_s":21.2,"margin_wh":13.96,"nearest_site_id":"L1","e_left_wh":29.69,"e_need_wh":7.73},
        {"s_m":270.0,"t_s":22.5,"margin_wh":14.09,"nearest_site_id":"L1","e_left_wh":29.68,"e_need_wh":7.58},
        {"s_m":285.0,"t_s":23.8,"margin_wh":14.23,"nearest_site_id":"L1","e_left_wh":29.66,"e_need_wh":7.43},
        {"s_m":300.0,"t_s":25.0,"margin_wh":14.36,"nearest_site_id":"L1","e_left_wh":29.64,"e_need_wh":7.28},
        {"s_m":315.0,"t_s":26.2,"margin_wh":14.49,"nearest_site_id":"L1","e_left_wh":29.62,"e_need_wh":7.13},
        {"s_m":330.0,"t_s":27.5,"margin_wh":14.62,"nearest_site_id":"L1","e_left_wh":29.6,"e_need_wh":6.98},
        {"s_m":345.0,"t_s":28.8,"margin_wh":14.75,"nearest_site_id":"L1","e_left_wh":29.59,"e_need_wh":6.83},
        {"s_m":360.0,"t_s":30.0,"margin_wh":14.88,"nearest_site_id":"L1","e_left_wh":29.57,"e_need_wh":6.69},
        {"s_m":375.0,"t_s":31.2,"margin_wh":15.01,"nearest_site_id":"L1","e_left_wh":29.55,"e_need_wh":6.54},
        {"s_m":390.0,"t_s":32.5,"margin_wh":15.15,"nearest_site_id":"L1","e_left_wh":29.53,"e_need_wh":6.39},
        {"s_m":405.0,"t_s":33.8,"margin_wh":15.28,"nearest_site_id":"L1","e_left_wh":29.51,"e_need_wh":6.24},
        {"s_m":420.0,"t_s":35.0,"margin_wh":15.41,"nearest_site_id":"L1","e_left_wh":29.5,"e_need_wh":6.09},
        {"s_m":435.0,"t_s":36.2,"margin_wh":15.54,"nearest_site_id":"L1","e_left_wh":29.48,"e_need_wh":5.94},
        {"s_m":450.0,"t_s":37.5,"margin_wh":15.67,"nearest_site_id":"L1","e_left_wh":29.46,"e_need_wh":5.79},
        {"s_m":465.0,"t_s":38.8,"margin_wh":15.8,"nearest_site_id":"L1","e_left_wh":29.44,"e_need_wh":5.64},
        {"s_m":480.0,"t_s":40.0,"margin_wh":15.93,"nearest_site_id":"L1","e_left_wh":29.42,"e_need_wh":5.49},
        {"s_m":495.0,"t_s":41.2,"margin_wh":16.06,"nearest_site_id":"L1","e_left_wh":29.41,"e_need_wh":5.34},
        {"s_m":510.0,"t_s":42.5,"margin_wh":16.19,"nearest_site_id":"L1","e_left_wh":29.39,"e_need_wh":5.19},
        {"s_m":525.0,"t_s":43.8,"margin_wh":16.33,"nearest_site_id":"L1","e_left_wh":29.37,"e_need_wh":5.04},
        {"s_m":540.0,"t_s":45.0,"margin_wh":16.46,"nearest_site_id":"L1","e_left_wh":29.35,"e_need_wh":4.9},
        {"s_m":555.0,"t_s":46.2,"margin_wh":16.59,"nearest_site_id":"L1","e_left_wh":29.33,"e_need_wh":4.75},
        {"s_m":570.0,"t_s":47.5,"margin_wh":16.72,"nearest_site_id":"L1","e_left_wh":29.32,"e_need_wh":4.6},
        {"s_m":585.0,"t_s":48.8,"margin_wh":16.85,"nearest_site_id":"L1","e_left_wh":29.3,"e_need_wh":4.45},
        {"s_m":600.0,"t_s":50.0,"margin_wh":16.97,"nearest_site_id":"L1","e_left_wh":29.28,"e_need_wh":4.31},
        {"s_m":615.0,"t_s":51.2,"margin_wh":17.1,"nearest_site_id":"L1","e_left_wh":29.26,"e_need_wh":4.16},
        {"s_m":630.0,"t_s":52.5,"margin_wh":17.23,"nearest_site_id":"L1","e_left_wh":29.24,"e_need_wh":4.01},
        {"s_m":645.0,"t_s":53.8,"margin_wh":17.36,"nearest_site_id":"L1","e_left_wh":29.23,"e_need_wh":3.87},
        {"s_m":660.0,"t_s":55.0,"margin_wh":17.49,"nearest_site_id":"L1","e_left_wh":29.21,"e_need_wh":3.72},
        {"s_m":675.0,"t_s":56.2,"margin_wh":17.61,"nearest_site_id":"L1","e_left_wh":29.19,"e_need_wh":3.58},
        {"s_m":690.0,"t_s":57.5,"margin_wh":17.73,"nearest_site_id":"L1","e_left_wh":29.17,"e_need_wh":3.44},
        {"s_m":705.0,"t_s":58.8,"margin_wh":17.85,"nearest_site_id":"L1","e_left_wh":29.15,"e_need_wh":3.3},
        {"s_m":720.0,"t_s":60.0,"margin_wh":17.97,"nearest_site_id":"L1","e_left_wh":29.14,"e_need_wh":3.17},
        {"s_m":735.0,"t_s":61.2,"margin_wh":18.07,"nearest_site_id":"L1","e_left_wh":29.12,"e_need_wh":3.05},
        {"s_m":750.0,"t_s":62.5,"margin_wh":18.16,"nearest_site_id":"L1","e_left_wh":29.1,"e_need_wh":2.94},
        {"s_m":765.0,"t_s":63.8,"margin_wh":18.21,"nearest_site_id":"L1","e_left_wh":29.08,"e_need_wh":2.87},
        {"s_m":780.0,"t_s":65.0,"margin_wh":18.21,"nearest_site_id":"L1","e_left_wh":29.06,"e_need_wh":2.85},
        {"s_m":795.0,"t_s":66.2,"margin_wh":18.15,"nearest_site_id":"L1","e_left_wh":29.05,"e_need_wh":2.9},
        {"s_m":810.0,"t_s":67.5,"margin_wh":18.04,"nearest_site_id":"L1","e_left_wh":29.03,"e_need_wh":2.98},
        {"s_m":825.0,"t_s":68.8,"margin_wh":17.91,"nearest_site_id":"L1","e_left_wh":29.01,"e_need_wh":3.1},
        {"s_m":840.0,"t_s":70.0,"margin_wh":17.77,"nearest_site_id":"L1","e_left_wh":28.99,"e_need_wh":3.22},
        {"s_m":855.0,"t_s":71.2,"margin_wh":17.62,"nearest_site_id":"L1","e_left_wh":28.97,"e_need_wh":3.36},
        {"s_m":870.0,"t_s":72.5,"margin_wh":17.46,"nearest_site_id":"L1","e_left_wh":28.96,"e_need_wh":3.49},
        {"s_m":885.0,"t_s":73.8,"margin_wh":17.3,"nearest_site_id":"L1","e_left_wh":28.94,"e_need_wh":3.64},
        {"s_m":900.0,"t_s":75.0,"margin_wh":17.14,"nearest_site_id":"L1","e_left_wh":28.92,"e_need_wh":3.78},
        {"s_m":915.0,"t_s":76.2,"margin_wh":16.98,"nearest_site_id":"L1","e_left_wh":28.9,"e_need_wh":3.92},
        {"s_m":930.0,"t_s":77.5,"margin_wh":16.81,"nearest_site_id":"L1","e_left_wh":28.88,"e_need_wh":4.07},
        {"s_m":945.0,"t_s":78.8,"margin_wh":16.65,"nearest_site_id":"L1","e_left_wh":28.87,"e_need_wh":4.22},
        {"s_m":960.0,"t_s":80.0,"margin_wh":16.48,"nearest_site_id":"L1","e_left_wh":28.85,"e_need_wh":4.36},
        {"s_m":975.0,"t_s":81.2,"margin_wh":16.32,"nearest_site_id":"L1","e_left_wh":28.83,"e_need_wh":4.51},
        {"s_m":990.0,"t_s":82.5,"margin_wh":16.15,"nearest_site_id":"L1","e_left_wh":28.81,"e_need_wh":4.66},
        {"s_m":1005.0,"t_s":83.8,"margin_wh":15.99,"nearest_site_id":"L1","e_left_wh":28.79,"e_need_wh":4.81},
        {"s_m":1020.0,"t_s":85.0,"margin_wh":15.82,"nearest_site_id":"L1","e_left_wh":28.78,"e_need_wh":4.96},
        {"s_m":1035.0,"t_s":86.2,"margin_wh":15.65,"nearest_site_id":"L1","e_left_wh":28.76,"e_need_wh":5.1},
        {"s_m":1050.0,"t_s":87.5,"margin_wh":15.49,"nearest_site_id":"L1","e_left_wh":28.74,"e_need_wh":5.25},
        {"s_m":1065.0,"t_s":88.8,"margin_wh":15.32,"nearest_site_id":"L1","e_left_wh":28.72,"e_need_wh":5.4},
        {"s_m":1080.0,"t_s":90.0,"margin_wh":15.15,"nearest_site_id":"L1","e_left_wh":28.7,"e_need_wh":5.55},
        {"s_m":1095.0,"t_s":91.2,"margin_wh":14.99,"nearest_site_id":"L1","e_left_wh":28.69,"e_need_wh":5.7},
        {"s_m":1110.0,"t_s":92.5,"margin_wh":14.82,"nearest_site_id":"L1","e_left_wh":28.67,"e_need_wh":5.85},
        {"s_m":1125.0,"t_s":93.8,"margin_wh":14.65,"nearest_site_id":"L1","e_left_wh":28.65,"e_need_wh":6.0},
        {"s_m":1140.0,"t_s":95.0,"margin_wh":14.49,"nearest_site_id":"L1","e_left_wh":28.63,"e_need_wh":6.15},
        {"s_m":1155.0,"t_s":96.2,"margin_wh":14.32,"nearest_site_id":"L1","e_left_wh":28.61,"e_need_wh":6.3},
        {"s_m":1170.0,"t_s":97.5,"margin_wh":14.15,"nearest_site_id":"L1","e_left_wh":28.6,"e_need_wh":6.45},
        {"s_m":1185.0,"t_s":98.8,"margin_wh":13.98,"nearest_site_id":"L1","e_left_wh":28.58,"e_need_wh":6.6},
        {"s_m":1200.0,"t_s":100.0,"margin_wh":13.82,"nearest_site_id":"L1","e_left_wh":28.56,"e_need_wh":6.74},
        {"s_m":1215.0,"t_s":101.2,"margin_wh":13.65,"nearest_site_id":"L1","e_left_wh":28.54,"e_need_wh":6.89},
        {"s_m":1230.0,"t_s":102.5,"margin_wh":13.48,"nearest_site_id":"L1","e_left_wh":28.52,"e_need_wh":7.04},
        {"s_m":1245.0,"t_s":103.8,"margin_wh":13.31,"nearest_site_id":"L1","e_left_wh":28.51,"e_need_wh":7.19},
        {"s_m":1260.0,"t_s":105.0,"margin_wh":13.15,"nearest_site_id":"L1","e_left_wh":28.49,"e_need_wh":7.34},
        {"s_m":1275.0,"t_s":106.2,"margin_wh":12.98,"nearest_site_id":"L1","e_left_wh":28.47,"e_need_wh":7.49},
        {"s_m":1290.0,"t_s":107.5,"margin_wh":12.81,"nearest_site_id":"L1","e_left_wh":28.45,"e_need_wh":7.64},
        {"s_m":1305.0,"t_s":108.8,"margin_wh":12.64,"nearest_site_id":"L1","e_left_wh":28.43,"e_need_wh":7.79},
        {"s_m":1320.0,"t_s":110.0,"margin_wh":12.47,"nearest_site_id":"L1","e_left_wh":28.42,"e_need_wh":7.94},
        {"s_m":1335.0,"t_s":111.2,"margin_wh":12.31,"nearest_site_id":"L1","e_left_wh":28.4,"e_need_wh":8.09},
        {"s_m":1350.0,"t_s":112.5,"margin_wh":12.14,"nearest_site_id":"L1","e_left_wh":28.38,"e_need_wh":8.24},
        {"s_m":1365.0,"t_s":113.8,"margin_wh":11.97,"nearest_site_id":"L1","e_left_wh":28.36,"e_need_wh":8.39},
        {"s_m":1380.0,"t_s":115.0,"margin_wh":11.8,"nearest_site_id":"L1","e_left_wh":28.34,"e_need_wh":8.54},
        {"s_m":1395.0,"t_s":116.2,"margin_wh":11.64,"nearest_site_id":"L1","e_left_wh":28.33,"e_need_wh":8.69},
        {"s_m":1410.0,"t_s":117.5,"margin_wh":11.47,"nearest_site_id":"L1","e_left_wh":28.31,"e_need_wh":8.84},
        {"s_m":1425.0,"t_s":118.8,"margin_wh":11.3,"nearest_site_id":"L1","e_left_wh":28.29,"e_need_wh":8.99},
        {"s_m":1440.0,"t_s":120.0,"margin_wh":11.13,"nearest_site_id":"L1","e_left_wh":28.27,"e_need_wh":9.14},
        {"s_m":1455.0,"t_s":121.2,"margin_wh":10.96,"nearest_site_id":"L1","e_left_wh":28.25,"e_need_wh":9.29},
        {"s_m":1470.0,"t_s":122.5,"margin_wh":10.8,"nearest_site_id":"L1","e_left_wh":28.24,"e_need_wh":9.44},
        {"s_m":1485.0,"t_s":123.8,"margin_wh":10.63,"nearest_site_id":"L1","e_left_wh":28.22,"e_need_wh":9.59},
        {"s_m":1500.0,"t_s":125.0,"margin_wh":10.46,"nearest_site_id":"L1","e_left_wh":28.2,"e_need_wh":9.74},
        {"s_m":1515.0,"t_s":126.2,"margin_wh":10.29,"nearest_site_id":"L1","e_left_wh":28.18,"e_need_wh":9.89},
        {"s_m":1530.0,"t_s":127.5,"margin_wh":10.13,"nearest_site_id":"L1","e_left_wh":28.16,"e_need_wh":10.04},
        {"s_m":1545.0,"t_s":128.8,"margin_wh":9.96,"nearest_site_id":"L1","e_left_wh":28.15,"e_need_wh":10.19},
        {"s_m":1560.0,"t_s":130.0,"margin_wh":9.8,"nearest_site_id":"L1","e_left_wh":28.13,"e_need_wh":10.33},
        {"s_m":1575.0,"t_s":131.2,"margin_wh":9.66,"nearest_site_id":"L1","e_left_wh":28.11,"e_need_wh":10.45},
        {"s_m":1590.0,"t_s":132.5,"margin_wh":9.53,"nearest_site_id":"L1","e_left_wh":28.09,"e_need_wh":10.56},
        {"s_m":1605.0,"t_s":133.8,"margin_wh":9.39,"nearest_site_id":"L1","e_left_wh":28.07,"e_need_wh":10.68},
        {"s_m":1620.0,"t_s":135.0,"margin_wh":9.25,"nearest_site_id":"L1","e_left_wh":28.06,"e_need_wh":10.8},
        {"s_m":1635.0,"t_s":136.2,"margin_wh":9.12,"nearest_site_id":"L1","e_left_wh":28.04,"e_need_wh":10.92},
        {"s_m":1650.0,"t_s":137.5,"margin_wh":8.98,"nearest_site_id":"L1","e_left_wh":28.02,"e_need_wh":11.04},
        {"s_m":1665.0,"t_s":138.8,"margin_wh":8.94,"nearest_site_id":"L2","e_left_wh":28.0,"e_need_wh":11.06},
        {"s_m":1680.0,"t_s":140.0,"margin_wh":9.01,"nearest_site_id":"L2","e_left_wh":27.98,"e_need_wh":10.97},
        {"s_m":1695.0,"t_s":141.2,"margin_wh":9.08,"nearest_site_id":"L2","e_left_wh":27.97,"e_need_wh":10.89},
        {"s_m":1710.0,"t_s":142.5,"margin_wh":9.14,"nearest_site_id":"L2","e_left_wh":27.95,"e_need_wh":10.81},
        {"s_m":1725.0,"t_s":143.8,"margin_wh":9.2,"nearest_site_id":"L2","e_left_wh":27.93,"e_need_wh":10.73},
        {"s_m":1740.0,"t_s":145.0,"margin_wh":9.26,"nearest_site_id":"L2","e_left_wh":27.91,"e_need_wh":10.65},
        {"s_m":1755.0,"t_s":146.2,"margin_wh":9.32,"nearest_site_id":"L2","e_left_wh":27.89,"e_need_wh":10.57},
        {"s_m":1770.0,"t_s":147.5,"margin_wh":9.38,"nearest_site_id":"L2","e_left_wh":27.88,"e_need_wh":10.5},
        {"s_m":1785.0,"t_s":148.8,"margin_wh":9.43,"nearest_site_id":"L2","e_left_wh":27.86,"e_need_wh":10.43},
        {"s_m":1800.0,"t_s":150.0,"margin_wh":9.48,"nearest_site_id":"L2","e_left_wh":27.84,"e_need_wh":10.36},
        {"s_m":1815.0,"t_s":151.2,"margin_wh":9.53,"nearest_site_id":"L2","e_left_wh":27.82,"e_need_wh":10.29},
        {"s_m":1830.0,"t_s":152.5,"margin_wh":9.58,"nearest_site_id":"L2","e_left_wh":27.8,"e_need_wh":10.23},
        {"s_m":1845.0,"t_s":153.8,"margin_wh":9.62,"nearest_site_id":"L2","e_left_wh":27.79,"e_need_wh":10.16},
        {"s_m":1860.0,"t_s":155.0,"margin_wh":9.66,"nearest_site_id":"L2","e_left_wh":27.77,"e_need_wh":10.1},
        {"s_m":1875.0,"t_s":156.2,"margin_wh":9.7,"nearest_site_id":"L2","e_left_wh":27.75,"e_need_wh":10.05},
        {"s_m":1890.0,"t_s":157.5,"margin_wh":9.74,"nearest_site_id":"L2","e_left_wh":27.73,"e_need_wh":9.99},
        {"s_m":1905.0,"t_s":158.8,"margin_wh":9.77,"nearest_site_id":"L2","e_left_wh":27.71,"e_need_wh":9.94},
        {"s_m":1920.0,"t_s":160.0,"margin_wh":9.8,"nearest_site_id":"L2","e_left_wh":27.7,"e_need_wh":9.89},
        {"s_m":1935.0,"t_s":161.2,"margin_wh":9.83,"nearest_site_id":"L2","e_left_wh":27.68,"e_need_wh":9.84},
        {"s_m":1950.0,"t_s":162.5,"margin_wh":9.86,"nearest_site_id":"L2","e_left_wh":27.66,"e_need_wh":9.8},
        {"s_m":1965.0,"t_s":163.8,"margin_wh":9.88,"nearest_site_id":"L2","e_left_wh":27.64,"e_need_wh":9.76},
        {"s_m":1980.0,"t_s":165.0,"margin_wh":9.9,"nearest_site_id":"L2","e_left_wh":27.62,"e_need_wh":9.72},
        {"s_m":1995.0,"t_s":166.2,"margin_wh":9.92,"nearest_site_id":"L2","e_left_wh":27.61,"e_need_wh":9.69},
        {"s_m":2010.0,"t_s":167.5,"margin_wh":9.93,"nearest_site_id":"L2","e_left_wh":27.59,"e_need_wh":9.65},
        {"s_m":2025.0,"t_s":168.8,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":27.57,"e_need_wh":9.62},
        {"s_m":2040.0,"t_s":170.0,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":27.55,"e_need_wh":9.6},
        {"s_m":2055.0,"t_s":171.2,"margin_wh":9.96,"nearest_site_id":"L2","e_left_wh":27.53,"e_need_wh":9.57},
        {"s_m":2070.0,"t_s":172.5,"margin_wh":9.96,"nearest_site_id":"L2","e_left_wh":27.52,"e_need_wh":9.55},
        {"s_m":2085.0,"t_s":173.8,"margin_wh":9.96,"nearest_site_id":"L2","e_left_wh":27.5,"e_need_wh":9.54},
        {"s_m":2100.0,"t_s":175.0,"margin_wh":9.96,"nearest_site_id":"L2","e_left_wh":27.48,"e_need_wh":9.52},
        {"s_m":2115.0,"t_s":176.2,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":27.46,"e_need_wh":9.51},
        {"s_m":2130.0,"t_s":177.5,"margin_wh":9.94,"nearest_site_id":"L2","e_left_wh":27.44,"e_need_wh":9.51},
        {"s_m":2145.0,"t_s":178.8,"margin_wh":9.92,"nearest_site_id":"L2","e_left_wh":27.43,"e_need_wh":9.5},
        {"s_m":2160.0,"t_s":180.0,"margin_wh":9.91,"nearest_site_id":"L2","e_left_wh":27.41,"e_need_wh":9.5},
        {"s_m":2175.0,"t_s":181.2,"margin_wh":9.89,"nearest_site_id":"L2","e_left_wh":27.39,"e_need_wh":9.5},
        {"s_m":2190.0,"t_s":182.5,"margin_wh":9.86,"nearest_site_id":"L2","e_left_wh":27.37,"e_need_wh":9.51},
        {"s_m":2205.0,"t_s":183.8,"margin_wh":9.84,"nearest_site_id":"L2","e_left_wh":27.35,"e_need_wh":9.52},
        {"s_m":2220.0,"t_s":185.0,"margin_wh":9.81,"nearest_site_id":"L2","e_left_wh":27.34,"e_need_wh":9.53},
        {"s_m":2235.0,"t_s":186.2,"margin_wh":9.77,"nearest_site_id":"L2","e_left_wh":27.32,"e_need_wh":9.54},
        {"s_m":2250.0,"t_s":187.5,"margin_wh":9.74,"nearest_site_id":"L2","e_left_wh":27.3,"e_need_wh":9.56},
        {"s_m":2265.0,"t_s":188.8,"margin_wh":9.7,"nearest_site_id":"L2","e_left_wh":27.28,"e_need_wh":9.58},
        {"s_m":2280.0,"t_s":190.0,"margin_wh":9.66,"nearest_site_id":"L2","e_left_wh":27.26,"e_need_wh":9.61},
        {"s_m":2295.0,"t_s":191.2,"margin_wh":9.61,"nearest_site_id":"L2","e_left_wh":27.25,"e_need_wh":9.63},
        {"s_m":2310.0,"t_s":192.5,"margin_wh":9.56,"nearest_site_id":"L2","e_left_wh":27.23,"e_need_wh":9.66},
        {"s_m":2325.0,"t_s":193.8,"margin_wh":9.51,"nearest_site_id":"L2","e_left_wh":27.21,"e_need_wh":9.7},
        {"s_m":2340.0,"t_s":195.0,"margin_wh":9.46,"nearest_site_id":"L2","e_left_wh":27.19,"e_need_wh":9.73},
        {"s_m":2355.0,"t_s":196.2,"margin_wh":9.4,"nearest_site_id":"L2","e_left_wh":27.17,"e_need_wh":9.77},
        {"s_m":2370.0,"t_s":197.5,"margin_wh":9.34,"nearest_site_id":"L2","e_left_wh":27.16,"e_need_wh":9.82},
        {"s_m":2385.0,"t_s":198.8,"margin_wh":9.28,"nearest_site_id":"L2","e_left_wh":27.14,"e_need_wh":9.86},
        {"s_m":2400.0,"t_s":200.0,"margin_wh":9.21,"nearest_site_id":"L2","e_left_wh":27.12,"e_need_wh":9.91},
        {"s_m":2415.0,"t_s":201.2,"margin_wh":9.23,"nearest_site_id":"L3","e_left_wh":27.1,"e_need_wh":9.88},
        {"s_m":2430.0,"t_s":202.5,"margin_wh":9.32,"nearest_site_id":"L3","e_left_wh":27.08,"e_need_wh":9.77},
        {"s_m":2445.0,"t_s":203.8,"margin_wh":9.41,"nearest_site_id":"L3","e_left_wh":27.07,"e_need_wh":9.66},
        {"s_m":2460.0,"t_s":205.0,"margin_wh":9.5,"nearest_site_id":"L3","e_left_wh":27.05,"e_need_wh":9.55},
        {"s_m":2475.0,"t_s":206.2,"margin_wh":9.58,"nearest_site_id":"L3","e_left_wh":27.03,"e_need_wh":9.45},
        {"s_m":2490.0,"t_s":207.5,"margin_wh":9.67,"nearest_site_id":"L3","e_left_wh":27.01,"e_need_wh":9.34},
        {"s_m":2505.0,"t_s":208.8,"margin_wh":9.75,"nearest_site_id":"L3","e_left_wh":26.99,"e_need_wh":9.24},
        {"s_m":2520.0,"t_s":210.0,"margin_wh":9.83,"nearest_site_id":"L3","e_left_wh":26.98,"e_need_wh":9.14},
        {"s_m":2535.0,"t_s":211.2,"margin_wh":9.91,"nearest_site_id":"L3","e_left_wh":26.96,"e_need_wh":9.04},
        {"s_m":2550.0,"t_s":212.5,"margin_wh":9.99,"nearest_site_id":"L3","e_left_wh":26.94,"e_need_wh":8.95},
        {"s_m":2565.0,"t_s":213.8,"margin_wh":10.07,"nearest_site_id":"L3","e_left_wh":26.92,"e_need_wh":8.85},
        {"s_m":2580.0,"t_s":215.0,"margin_wh":10.14,"nearest_site_id":"L3","e_left_wh":26.9,"e_need_wh":8.76},
        {"s_m":2595.0,"t_s":216.2,"margin_wh":10.21,"nearest_site_id":"L3","e_left_wh":26.89,"e_need_wh":8.67},
        {"s_m":2610.0,"t_s":217.5,"margin_wh":10.28,"nearest_site_id":"L3","e_left_wh":26.87,"e_need_wh":8.59},
        {"s_m":2625.0,"t_s":218.8,"margin_wh":10.35,"nearest_site_id":"L3","e_left_wh":26.85,"e_need_wh":8.5},
        {"s_m":2640.0,"t_s":220.0,"margin_wh":10.41,"nearest_site_id":"L3","e_left_wh":26.83,"e_need_wh":8.42},
        {"s_m":2655.0,"t_s":221.2,"margin_wh":10.47,"nearest_site_id":"L3","e_left_wh":26.81,"e_need_wh":8.34},
        {"s_m":2670.0,"t_s":222.5,"margin_wh":10.53,"nearest_site_id":"L3","e_left_wh":26.8,"e_need_wh":8.27},
        {"s_m":2685.0,"t_s":223.8,"margin_wh":10.58,"nearest_site_id":"L3","e_left_wh":26.78,"e_need_wh":8.19},
        {"s_m":2700.0,"t_s":225.0,"margin_wh":10.64,"nearest_site_id":"L3","e_left_wh":26.76,"e_need_wh":8.12},
        {"s_m":2715.0,"t_s":226.2,"margin_wh":10.58,"nearest_site_id":"L3","e_left_wh":26.74,"e_need_wh":8.16},
        {"s_m":2730.0,"t_s":227.5,"margin_wh":10.43,"nearest_site_id":"L3","e_left_wh":26.72,"e_need_wh":8.29},
        {"s_m":2745.0,"t_s":228.8,"margin_wh":10.28,"nearest_site_id":"L3","e_left_wh":26.71,"e_need_wh":8.43},
        {"s_m":2760.0,"t_s":230.0,"margin_wh":10.12,"nearest_site_id":"L3","e_left_wh":26.69,"e_need_wh":8.57},
        {"s_m":2775.0,"t_s":231.2,"margin_wh":9.97,"nearest_site_id":"L3","e_left_wh":26.67,"e_need_wh":8.7},
        {"s_m":2790.0,"t_s":232.5,"margin_wh":9.81,"nearest_site_id":"L3","e_left_wh":26.65,"e_need_wh":8.84},
        {"s_m":2805.0,"t_s":233.8,"margin_wh":9.65,"nearest_site_id":"L3","e_left_wh":26.63,"e_need_wh":8.98},
        {"s_m":2820.0,"t_s":235.0,"margin_wh":9.5,"nearest_site_id":"L3","e_left_wh":26.62,"e_need_wh":9.12},
        {"s_m":2835.0,"t_s":236.2,"margin_wh":9.34,"nearest_site_id":"L3","e_left_wh":26.6,"e_need_wh":9.26},
        {"s_m":2850.0,"t_s":237.5,"margin_wh":9.18,"nearest_site_id":"L3","e_left_wh":26.58,"e_need_wh":9.4},
        {"s_m":2865.0,"t_s":238.8,"margin_wh":9.03,"nearest_site_id":"L3","e_left_wh":26.56,"e_need_wh":9.54},
        {"s_m":2880.0,"t_s":240.0,"margin_wh":8.87,"nearest_site_id":"L3","e_left_wh":26.54,"e_need_wh":9.68},
        {"s_m":2895.0,"t_s":241.2,"margin_wh":8.71,"nearest_site_id":"L3","e_left_wh":26.53,"e_need_wh":9.82},
        {"s_m":2910.0,"t_s":242.5,"margin_wh":8.59,"nearest_site_id":"L2","e_left_wh":26.51,"e_need_wh":9.91},
        {"s_m":2925.0,"t_s":243.8,"margin_wh":8.68,"nearest_site_id":"L2","e_left_wh":26.49,"e_need_wh":9.81},
        {"s_m":2940.0,"t_s":245.0,"margin_wh":8.76,"nearest_site_id":"L2","e_left_wh":26.47,"e_need_wh":9.72},
        {"s_m":2955.0,"t_s":246.2,"margin_wh":8.83,"nearest_site_id":"L2","e_left_wh":26.45,"e_need_wh":9.62},
        {"s_m":2970.0,"t_s":247.5,"margin_wh":8.91,"nearest_site_id":"L2","e_left_wh":26.44,"e_need_wh":9.53},
        {"s_m":2985.0,"t_s":248.8,"margin_wh":8.98,"nearest_site_id":"L2","e_left_wh":26.42,"e_need_wh":9.43},
        {"s_m":3000.0,"t_s":250.0,"margin_wh":9.06,"nearest_site_id":"L2","e_left_wh":26.4,"e_need_wh":9.34},
        {"s_m":3015.0,"t_s":251.2,"margin_wh":9.13,"nearest_site_id":"L2","e_left_wh":26.38,"e_need_wh":9.26},
        {"s_m":3030.0,"t_s":252.5,"margin_wh":9.19,"nearest_site_id":"L2","e_left_wh":26.36,"e_need_wh":9.17},
        {"s_m":3045.0,"t_s":253.8,"margin_wh":9.26,"nearest_site_id":"L2","e_left_wh":26.35,"e_need_wh":9.09},
        {"s_m":3060.0,"t_s":255.0,"margin_wh":9.32,"nearest_site_id":"L2","e_left_wh":26.33,"e_need_wh":9.0},
        {"s_m":3075.0,"t_s":256.2,"margin_wh":9.38,"nearest_site_id":"L2","e_left_wh":26.31,"e_need_wh":8.93},
        {"s_m":3090.0,"t_s":257.5,"margin_wh":9.44,"nearest_site_id":"L2","e_left_wh":26.29,"e_need_wh":8.85},
        {"s_m":3105.0,"t_s":258.8,"margin_wh":9.5,"nearest_site_id":"L2","e_left_wh":26.27,"e_need_wh":8.78},
        {"s_m":3120.0,"t_s":260.0,"margin_wh":9.55,"nearest_site_id":"L2","e_left_wh":26.26,"e_need_wh":8.7},
        {"s_m":3135.0,"t_s":261.2,"margin_wh":9.6,"nearest_site_id":"L2","e_left_wh":26.24,"e_need_wh":8.64},
        {"s_m":3150.0,"t_s":262.5,"margin_wh":9.65,"nearest_site_id":"L2","e_left_wh":26.22,"e_need_wh":8.57},
        {"s_m":3165.0,"t_s":263.8,"margin_wh":9.69,"nearest_site_id":"L2","e_left_wh":26.2,"e_need_wh":8.51},
        {"s_m":3180.0,"t_s":265.0,"margin_wh":9.73,"nearest_site_id":"L2","e_left_wh":26.18,"e_need_wh":8.45},
        {"s_m":3195.0,"t_s":266.2,"margin_wh":9.77,"nearest_site_id":"L2","e_left_wh":26.17,"e_need_wh":8.4},
        {"s_m":3210.0,"t_s":267.5,"margin_wh":9.81,"nearest_site_id":"L2","e_left_wh":26.15,"e_need_wh":8.34},
        {"s_m":3225.0,"t_s":268.8,"margin_wh":9.84,"nearest_site_id":"L2","e_left_wh":26.13,"e_need_wh":8.29},
        {"s_m":3240.0,"t_s":270.0,"margin_wh":9.86,"nearest_site_id":"L2","e_left_wh":26.11,"e_need_wh":8.25},
        {"s_m":3255.0,"t_s":271.2,"margin_wh":9.89,"nearest_site_id":"L2","e_left_wh":26.09,"e_need_wh":8.21},
        {"s_m":3270.0,"t_s":272.5,"margin_wh":9.91,"nearest_site_id":"L2","e_left_wh":26.08,"e_need_wh":8.17},
        {"s_m":3285.0,"t_s":273.8,"margin_wh":9.92,"nearest_site_id":"L2","e_left_wh":26.06,"e_need_wh":8.13},
        {"s_m":3300.0,"t_s":275.0,"margin_wh":9.94,"nearest_site_id":"L2","e_left_wh":26.04,"e_need_wh":8.1},
        {"s_m":3315.0,"t_s":276.2,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":26.02,"e_need_wh":8.08},
        {"s_m":3330.0,"t_s":277.5,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":26.0,"e_need_wh":8.05},
        {"s_m":3345.0,"t_s":278.8,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":25.99,"e_need_wh":8.04},
        {"s_m":3360.0,"t_s":280.0,"margin_wh":9.95,"nearest_site_id":"L2","e_left_wh":25.97,"e_need_wh":8.02},
        {"s_m":3375.0,"t_s":281.2,"margin_wh":9.94,"nearest_site_id":"L2","e_left_wh":25.95,"e_need_wh":8.01},
        {"s_m":3390.0,"t_s":282.5,"margin_wh":9.93,"nearest_site_id":"L2","e_left_wh":25.93,"e_need_wh":8.0},
        {"s_m":3405.0,"t_s":283.8,"margin_wh":9.91,"nearest_site_id":"L2","e_left_wh":25.91,"e_need_wh":8.0},
        {"s_m":3420.0,"t_s":285.0,"margin_wh":9.89,"nearest_site_id":"L2","e_left_wh":25.9,"e_need_wh":8.0},
        {"s_m":3435.0,"t_s":286.2,"margin_wh":9.87,"nearest_site_id":"L2","e_left_wh":25.88,"e_need_wh":8.01},
        {"s_m":3450.0,"t_s":287.5,"margin_wh":9.84,"nearest_site_id":"L2","e_left_wh":25.86,"e_need_wh":8.02},
        {"s_m":3465.0,"t_s":288.8,"margin_wh":9.81,"nearest_site_id":"L2","e_left_wh":25.84,"e_need_wh":8.03},
        {"s_m":3480.0,"t_s":290.0,"margin_wh":9.78,"nearest_site_id":"L2","e_left_wh":25.82,"e_need_wh":8.05},
        {"s_m":3495.0,"t_s":291.2,"margin_wh":9.74,"nearest_site_id":"L2","e_left_wh":25.81,"e_need_wh":8.07},
        {"s_m":3510.0,"t_s":292.5,"margin_wh":9.69,"nearest_site_id":"L2","e_left_wh":25.79,"e_need_wh":8.1},
        {"s_m":3525.0,"t_s":293.8,"margin_wh":9.65,"nearest_site_id":"L2","e_left_wh":25.77,"e_need_wh":8.12},
        {"s_m":3540.0,"t_s":295.0,"margin_wh":9.59,"nearest_site_id":"L2","e_left_wh":25.75,"e_need_wh":8.16},
        {"s_m":3555.0,"t_s":296.2,"margin_wh":9.54,"nearest_site_id":"L2","e_left_wh":25.73,"e_need_wh":8.2},
        {"s_m":3570.0,"t_s":297.5,"margin_wh":9.48,"nearest_site_id":"L2","e_left_wh":25.72,"e_need_wh":8.24},
        {"s_m":3585.0,"t_s":298.8,"margin_wh":9.42,"nearest_site_id":"L2","e_left_wh":25.7,"e_need_wh":8.28},
        {"s_m":3600.0,"t_s":300.0,"margin_wh":9.35,"nearest_site_id":"L2","e_left_wh":25.68,"e_need_wh":8.33},
        {"s_m":3615.0,"t_s":301.2,"margin_wh":9.28,"nearest_site_id":"L2","e_left_wh":25.66,"e_need_wh":8.38},
        {"s_m":3630.0,"t_s":302.5,"margin_wh":9.21,"nearest_site_id":"L2","e_left_wh":25.64,"e_need_wh":8.43},
        {"s_m":3645.0,"t_s":303.8,"margin_wh":9.13,"nearest_site_id":"L2","e_left_wh":25.63,"e_need_wh":8.49},
        {"s_m":3660.0,"t_s":305.0,"margin_wh":9.06,"nearest_site_id":"L2","e_left_wh":25.61,"e_need_wh":8.55},
        {"s_m":3675.0,"t_s":306.2,"margin_wh":8.97,"nearest_site_id":"L2","e_left_wh":25.59,"e_need_wh":8.62},
        {"s_m":3690.0,"t_s":307.5,"margin_wh":8.89,"nearest_site_id":"L2","e_left_wh":25.57,"e_need_wh":8.68},
        {"s_m":3705.0,"t_s":308.8,"margin_wh":8.8,"nearest_site_id":"L2","e_left_wh":25.55,"e_need_wh":8.75},
        {"s_m":3720.0,"t_s":310.0,"margin_wh":8.71,"nearest_site_id":"L2","e_left_wh":25.54,"e_need_wh":8.83},
        {"s_m":3735.0,"t_s":311.2,"margin_wh":8.62,"nearest_site_id":"L2","e_left_wh":25.52,"e_need_wh":8.9},
        {"s_m":3750.0,"t_s":312.5,"margin_wh":8.52,"nearest_site_id":"L2","e_left_wh":25.5,"e_need_wh":8.98},
        {"s_m":3765.0,"t_s":313.8,"margin_wh":8.42,"nearest_site_id":"L2","e_left_wh":25.48,"e_need_wh":9.06},
        {"s_m":3780.0,"t_s":315.0,"margin_wh":8.32,"nearest_site_id":"L2","e_left_wh":25.46,"e_need_wh":9.14},
        {"s_m":3795.0,"t_s":316.2,"margin_wh":8.22,"nearest_site_id":"L2","e_left_wh":25.45,"e_need_wh":9.23},
        {"s_m":3810.0,"t_s":317.5,"margin_wh":8.11,"nearest_site_id":"L2","e_left_wh":25.43,"e_need_wh":9.32},
        {"s_m":3825.0,"t_s":318.8,"margin_wh":8.0,"nearest_site_id":"L2","e_left_wh":25.41,"e_need_wh":9.41},
        {"s_m":3840.0,"t_s":320.0,"margin_wh":7.89,"nearest_site_id":"L2","e_left_wh":25.39,"e_need_wh":9.5},
        {"s_m":3855.0,"t_s":321.2,"margin_wh":7.78,"nearest_site_id":"L2","e_left_wh":25.37,"e_need_wh":9.59},
        {"s_m":3870.0,"t_s":322.5,"margin_wh":7.67,"nearest_site_id":"L2","e_left_wh":25.36,"e_need_wh":9.69},
        {"s_m":3885.0,"t_s":323.8,"margin_wh":7.55,"nearest_site_id":"L2","e_left_wh":25.34,"e_need_wh":9.79},
        {"s_m":3900.0,"t_s":325.0,"margin_wh":7.44,"nearest_site_id":"L2","e_left_wh":25.32,"e_need_wh":9.88},
        {"s_m":3915.0,"t_s":326.2,"margin_wh":7.31,"nearest_site_id":"L2","e_left_wh":25.3,"e_need_wh":9.99},
        {"s_m":3930.0,"t_s":327.5,"margin_wh":7.18,"nearest_site_id":"L2","e_left_wh":25.28,"e_need_wh":10.1},
        {"s_m":3945.0,"t_s":328.8,"margin_wh":7.05,"nearest_site_id":"L2","e_left_wh":25.27,"e_need_wh":10.22},
        {"s_m":3960.0,"t_s":330.0,"margin_wh":6.92,"nearest_site_id":"L2","e_left_wh":25.25,"e_need_wh":10.33},
        {"s_m":3975.0,"t_s":331.2,"margin_wh":6.78,"nearest_site_id":"L2","e_left_wh":25.23,"e_need_wh":10.45},
        {"s_m":3990.0,"t_s":332.5,"margin_wh":6.65,"nearest_site_id":"L2","e_left_wh":25.21,"e_need_wh":10.56},
        {"s_m":4005.0,"t_s":333.8,"margin_wh":6.51,"nearest_site_id":"L2","e_left_wh":25.19,"e_need_wh":10.68},
        {"s_m":4020.0,"t_s":335.0,"margin_wh":6.37,"nearest_site_id":"L2","e_left_wh":25.18,"e_need_wh":10.8},
        {"s_m":4035.0,"t_s":336.2,"margin_wh":6.24,"nearest_site_id":"L2","e_left_wh":25.16,"e_need_wh":10.92},
        {"s_m":4050.0,"t_s":337.5,"margin_wh":6.1,"nearest_site_id":"L2","e_left_wh":25.14,"e_need_wh":11.04},
        {"s_m":4065.0,"t_s":338.8,"margin_wh":5.96,"nearest_site_id":"L2","e_left_wh":25.12,"e_need_wh":11.17},
        {"s_m":4080.0,"t_s":340.0,"margin_wh":5.82,"nearest_site_id":"L2","e_left_wh":25.1,"e_need_wh":11.29},
        {"s_m":4095.0,"t_s":341.2,"margin_wh":5.67,"nearest_site_id":"L2","e_left_wh":25.09,"e_need_wh":11.41},
        {"s_m":4110.0,"t_s":342.5,"margin_wh":5.54,"nearest_site_id":"L2","e_left_wh":25.07,"e_need_wh":11.53},
        {"s_m":4125.0,"t_s":343.8,"margin_wh":5.44,"nearest_site_id":"L2","e_left_wh":25.05,"e_need_wh":11.61},
        {"s_m":4140.0,"t_s":345.0,"margin_wh":5.33,"nearest_site_id":"L2","e_left_wh":25.03,"e_need_wh":11.7},
        {"s_m":4155.0,"t_s":346.2,"margin_wh":5.23,"nearest_site_id":"L2","e_left_wh":25.01,"e_need_wh":11.79},
        {"s_m":4170.0,"t_s":347.5,"margin_wh":5.12,"nearest_site_id":"L2","e_left_wh":25.0,"e_need_wh":11.88},
        {"s_m":4185.0,"t_s":348.8,"margin_wh":5.01,"nearest_site_id":"L2","e_left_wh":24.98,"e_need_wh":11.97},
        {"s_m":4200.0,"t_s":350.0,"margin_wh":4.9,"nearest_site_id":"L2","e_left_wh":24.96,"e_need_wh":12.06},
        {"s_m":4215.0,"t_s":351.2,"margin_wh":4.79,"nearest_site_id":"L2","e_left_wh":24.94,"e_need_wh":12.15},
        {"s_m":4230.0,"t_s":352.5,"margin_wh":4.68,"nearest_site_id":"L2","e_left_wh":24.92,"e_need_wh":12.25},
        {"s_m":4245.0,"t_s":353.8,"margin_wh":4.56,"nearest_site_id":"L2","e_left_wh":24.91,"e_need_wh":12.34},
        {"s_m":4260.0,"t_s":355.0,"margin_wh":4.45,"nearest_site_id":"L2","e_left_wh":24.89,"e_need_wh":12.44},
        {"s_m":4275.0,"t_s":356.2,"margin_wh":4.33,"nearest_site_id":"L2","e_left_wh":24.87,"e_need_wh":12.54},
        {"s_m":4290.0,"t_s":357.5,"margin_wh":4.21,"nearest_site_id":"L2","e_left_wh":24.85,"e_need_wh":12.64},
        {"s_m":4305.0,"t_s":358.8,"margin_wh":4.09,"nearest_site_id":"L2","e_left_wh":24.83,"e_need_wh":12.74},
        {"s_m":4320.0,"t_s":360.0,"margin_wh":3.97,"nearest_site_id":"L2","e_left_wh":24.82,"e_need_wh":12.85},
        {"s_m":4335.0,"t_s":361.2,"margin_wh":3.85,"nearest_site_id":"L2","e_left_wh":24.8,"e_need_wh":12.95},
        {"s_m":4350.0,"t_s":362.5,"margin_wh":3.72,"nearest_site_id":"L2","e_left_wh":24.78,"e_need_wh":13.06},
        {"s_m":4365.0,"t_s":363.8,"margin_wh":3.6,"nearest_site_id":"L2","e_left_wh":24.76,"e_need_wh":13.16},
        {"s_m":4380.0,"t_s":365.0,"margin_wh":3.48,"nearest_site_id":"L2","e_left_wh":24.74,"e_need_wh":13.27},
        {"s_m":4395.0,"t_s":366.2,"margin_wh":3.35,"nearest_site_id":"L2","e_left_wh":24.73,"e_need_wh":13.38},
        {"s_m":4410.0,"t_s":367.5,"margin_wh":3.22,"nearest_site_id":"L2","e_left_wh":24.71,"e_need_wh":13.49},
        {"s_m":4425.0,"t_s":368.8,"margin_wh":3.09,"nearest_site_id":"L2","e_left_wh":24.69,"e_need_wh":13.6},
        {"s_m":4440.0,"t_s":370.0,"margin_wh":2.96,"nearest_site_id":"L2","e_left_wh":24.67,"e_need_wh":13.71},
        {"s_m":4455.0,"t_s":371.2,"margin_wh":2.84,"nearest_site_id":"L2","e_left_wh":24.65,"e_need_wh":13.82},
        {"s_m":4457.24,"t_s":371.4,"margin_wh":2.82,"nearest_site_id":"L2","e_left_wh":24.65,"e_need_wh":13.84}
      ],
      "is_simulated": true
    },
    {
      "route_id": "RT-S2-04-A",
      "task_id": "T-S2-04",
      "plan_version": "v1",
      "reserve_wh": 8.0,
      "samples": [
        {"s_m":0.0,"t_s":0.0,"margin_wh":11.25,"nearest_site_id":"L1","e_left_wh":30.0,"e_need_wh":10.75},
        {"s_m":15.0,"t_s":1.2,"margin_wh":11.21,"nearest_site_id":"L1","e_left_wh":29.98,"e_need_wh":10.77},
        {"s_m":30.0,"t_s":2.5,"margin_wh":11.17,"nearest_site_id":"L1","e_left_wh":29.96,"e_need_wh":10.79},
        {"s_m":45.0,"t_s":3.8,"margin_wh":11.13,"nearest_site_id":"L1","e_left_wh":29.95,"e_need_wh":10.82},
        {"s_m":60.0,"t_s":5.0,"margin_wh":11.08,"nearest_site_id":"L1","e_left_wh":29.93,"e_need_wh":10.85},
        {"s_m":75.0,"t_s":6.2,"margin_wh":11.03,"nearest_site_id":"L1","e_left_wh":29.91,"e_need_wh":10.88},
        {"s_m":90.0,"t_s":7.5,"margin_wh":10.98,"nearest_site_id":"L1","e_left_wh":29.89,"e_need_wh":10.91},
        {"s_m":105.0,"t_s":8.8,"margin_wh":10.92,"nearest_site_id":"L1","e_left_wh":29.87,"e_need_wh":10.95},
        {"s_m":120.0,"t_s":10.0,"margin_wh":10.87,"nearest_site_id":"L1","e_left_wh":29.86,"e_need_wh":10.99},
        {"s_m":135.0,"t_s":11.2,"margin_wh":10.81,"nearest_site_id":"L1","e_left_wh":29.84,"e_need_wh":11.03},
        {"s_m":150.0,"t_s":12.5,"margin_wh":10.75,"nearest_site_id":"L1","e_left_wh":29.82,"e_need_wh":11.07},
        {"s_m":165.0,"t_s":13.8,"margin_wh":10.68,"nearest_site_id":"L1","e_left_wh":29.8,"e_need_wh":11.12},
        {"s_m":180.0,"t_s":15.0,"margin_wh":10.61,"nearest_site_id":"L1","e_left_wh":29.78,"e_need_wh":11.17},
        {"s_m":195.0,"t_s":16.2,"margin_wh":10.54,"nearest_site_id":"L1","e_left_wh":29.77,"e_need_wh":11.22},
        {"s_m":210.0,"t_s":17.5,"margin_wh":10.47,"nearest_site_id":"L1","e_left_wh":29.75,"e_need_wh":11.28},
        {"s_m":225.0,"t_s":18.8,"margin_wh":10.4,"nearest_site_id":"L1","e_left_wh":29.73,"e_need_wh":11.33},
        {"s_m":240.0,"t_s":20.0,"margin_wh":10.32,"nearest_site_id":"L1","e_left_wh":29.71,"e_need_wh":11.39},
        {"s_m":255.0,"t_s":21.2,"margin_wh":10.25,"nearest_site_id":"L1","e_left_wh":29.69,"e_need_wh":11.45},
        {"s_m":270.0,"t_s":22.5,"margin_wh":10.17,"nearest_site_id":"L1","e_left_wh":29.68,"e_need_wh":11.51},
        {"s_m":285.0,"t_s":23.8,"margin_wh":10.08,"nearest_site_id":"L1","e_left_wh":29.66,"e_need_wh":11.57},
        {"s_m":300.0,"t_s":25.0,"margin_wh":10.0,"nearest_site_id":"L1","e_left_wh":29.64,"e_need_wh":11.64},
        {"s_m":315.0,"t_s":26.2,"margin_wh":9.91,"nearest_site_id":"L1","e_left_wh":29.62,"e_need_wh":11.71},
        {"s_m":330.0,"t_s":27.5,"margin_wh":9.82,"nearest_site_id":"L1","e_left_wh":29.6,"e_need_wh":11.78},
        {"s_m":345.0,"t_s":28.8,"margin_wh":9.73,"nearest_site_id":"L1","e_left_wh":29.59,"e_need_wh":11.85},
        {"s_m":360.0,"t_s":30.0,"margin_wh":9.64,"nearest_site_id":"L1","e_left_wh":29.57,"e_need_wh":11.93},
        {"s_m":375.0,"t_s":31.2,"margin_wh":9.55,"nearest_site_id":"L1","e_left_wh":29.55,"e_need_wh":12.0},
        {"s_m":390.0,"t_s":32.5,"margin_wh":9.45,"nearest_site_id":"L1","e_left_wh":29.53,"e_need_wh":12.08},
        {"s_m":405.0,"t_s":33.8,"margin_wh":9.36,"nearest_site_id":"L1","e_left_wh":29.51,"e_need_wh":12.16},
        {"s_m":420.0,"t_s":35.0,"margin_wh":9.26,"nearest_site_id":"L1","e_left_wh":29.5,"e_need_wh":12.24},
        {"s_m":435.0,"t_s":36.2,"margin_wh":9.16,"nearest_site_id":"L1","e_left_wh":29.48,"e_need_wh":12.32},
        {"s_m":450.0,"t_s":37.5,"margin_wh":9.06,"nearest_site_id":"L1","e_left_wh":29.46,"e_need_wh":12.4},
        {"s_m":465.0,"t_s":38.8,"margin_wh":9.0,"nearest_site_id":"L2","e_left_wh":29.44,"e_need_wh":12.44},
        {"s_m":480.0,"t_s":40.0,"margin_wh":9.13,"nearest_site_id":"L2","e_left_wh":29.42,"e_need_wh":12.3},
        {"s_m":495.0,"t_s":41.2,"margin_wh":9.26,"nearest_site_id":"L2","e_left_wh":29.41,"e_need_wh":12.15},
        {"s_m":510.0,"t_s":42.5,"margin_wh":9.39,"nearest_site_id":"L2","e_left_wh":29.39,"e_need_wh":12.0},
        {"s_m":525.0,"t_s":43.8,"margin_wh":9.52,"nearest_site_id":"L2","e_left_wh":29.37,"e_need_wh":11.85},
        {"s_m":540.0,"t_s":45.0,"margin_wh":9.65,"nearest_site_id":"L2","e_left_wh":29.35,"e_need_wh":11.7},
        {"s_m":555.0,"t_s":46.2,"margin_wh":9.78,"nearest_site_id":"L2","e_left_wh":29.33,"e_need_wh":11.55},
        {"s_m":570.0,"t_s":47.5,"margin_wh":9.91,"nearest_site_id":"L2","e_left_wh":29.32,"e_need_wh":11.41},
        {"s_m":585.0,"t_s":48.8,"margin_wh":10.04,"nearest_site_id":"L2","e_left_wh":29.3,"e_need_wh":11.26},
        {"s_m":600.0,"t_s":50.0,"margin_wh":10.17,"nearest_site_id":"L2","e_left_wh":29.28,"e_need_wh":11.11},
        {"s_m":615.0,"t_s":51.2,"margin_wh":10.3,"nearest_site_id":"L2","e_left_wh":29.26,"e_need_wh":10.96},
        {"s_m":630.0,"t_s":52.5,"margin_wh":10.43,"nearest_site_id":"L2","e_left_wh":29.24,"e_need_wh":10.82},
        {"s_m":645.0,"t_s":53.8,"margin_wh":10.56,"nearest_site_id":"L2","e_left_wh":29.23,"e_need_wh":10.67},
        {"s_m":660.0,"t_s":55.0,"margin_wh":10.69,"nearest_site_id":"L2","e_left_wh":29.21,"e_need_wh":10.52},
        {"s_m":675.0,"t_s":56.2,"margin_wh":10.82,"nearest_site_id":"L2","e_left_wh":29.19,"e_need_wh":10.37},
        {"s_m":690.0,"t_s":57.5,"margin_wh":10.95,"nearest_site_id":"L2","e_left_wh":29.17,"e_need_wh":10.23},
        {"s_m":705.0,"t_s":58.8,"margin_wh":11.08,"nearest_site_id":"L2","e_left_wh":29.15,"e_need_wh":10.08},
        {"s_m":720.0,"t_s":60.0,"margin_wh":11.21,"nearest_site_id":"L2","e_left_wh":29.14,"e_need_wh":9.93},
        {"s_m":735.0,"t_s":61.2,"margin_wh":11.33,"nearest_site_id":"L2","e_left_wh":29.12,"e_need_wh":9.78},
        {"s_m":750.0,"t_s":62.5,"margin_wh":11.46,"nearest_site_id":"L2","e_left_wh":29.1,"e_need_wh":9.64},
        {"s_m":765.0,"t_s":63.8,"margin_wh":11.59,"nearest_site_id":"L2","e_left_wh":29.08,"e_need_wh":9.49},
        {"s_m":780.0,"t_s":65.0,"margin_wh":11.72,"nearest_site_id":"L2","e_left_wh":29.06,"e_need_wh":9.34},
        {"s_m":795.0,"t_s":66.2,"margin_wh":11.85,"nearest_site_id":"L2","e_left_wh":29.05,"e_need_wh":9.19},
        {"s_m":810.0,"t_s":67.5,"margin_wh":11.98,"nearest_site_id":"L2","e_left_wh":29.03,"e_need_wh":9.05},
        {"s_m":825.0,"t_s":68.8,"margin_wh":12.11,"nearest_site_id":"L2","e_left_wh":29.01,"e_need_wh":8.9},
        {"s_m":840.0,"t_s":70.0,"margin_wh":12.24,"nearest_site_id":"L2","e_left_wh":28.99,"e_need_wh":8.75},
        {"s_m":855.0,"t_s":71.2,"margin_wh":12.37,"nearest_site_id":"L2","e_left_wh":28.97,"e_need_wh":8.61},
        {"s_m":870.0,"t_s":72.5,"margin_wh":12.5,"nearest_site_id":"L2","e_left_wh":28.96,"e_need_wh":8.46},
        {"s_m":885.0,"t_s":73.8,"margin_wh":12.62,"nearest_site_id":"L2","e_left_wh":28.94,"e_need_wh":8.31},
        {"s_m":900.0,"t_s":75.0,"margin_wh":12.75,"nearest_site_id":"L2","e_left_wh":28.92,"e_need_wh":8.17},
        {"s_m":915.0,"t_s":76.2,"margin_wh":12.88,"nearest_site_id":"L2","e_left_wh":28.9,"e_need_wh":8.02},
        {"s_m":930.0,"t_s":77.5,"margin_wh":13.01,"nearest_site_id":"L2","e_left_wh":28.88,"e_need_wh":7.88},
        {"s_m":945.0,"t_s":78.8,"margin_wh":13.14,"nearest_site_id":"L2","e_left_wh":28.87,"e_need_wh":7.73},
        {"s_m":960.0,"t_s":80.0,"margin_wh":13.26,"nearest_site_id":"L2","e_left_wh":28.85,"e_need_wh":7.59},
        {"s_m":975.0,"t_s":81.2,"margin_wh":13.39,"nearest_site_id":"L2","e_left_wh":28.83,"e_need_wh":7.44},
        {"s_m":990.0,"t_s":82.5,"margin_wh":13.52,"nearest_site_id":"L2","e_left_wh":28.81,"e_need_wh":7.3},
        {"s_m":1005.0,"t_s":83.8,"margin_wh":13.64,"nearest_site_id":"L2","e_left_wh":28.79,"e_need_wh":7.15},
        {"s_m":1020.0,"t_s":85.0,"margin_wh":13.77,"nearest_site_id":"L2","e_left_wh":28.78,"e_need_wh":7.01},
        {"s_m":1035.0,"t_s":86.2,"margin_wh":13.89,"nearest_site_id":"L2","e_left_wh":28.76,"e_need_wh":6.86},
        {"s_m":1050.0,"t_s":87.5,"margin_wh":14.02,"nearest_site_id":"L2","e_left_wh":28.74,"e_need_wh":6.72},
        {"s_m":1065.0,"t_s":88.8,"margin_wh":14.14,"nearest_site_id":"L2","e_left_wh":28.72,"e_need_wh":6.58},
        {"s_m":1080.0,"t_s":90.0,"margin_wh":14.27,"nearest_site_id":"L2","e_left_wh":28.7,"e_need_wh":6.44},
        {"s_m":1095.0,"t_s":91.2,"margin_wh":14.39,"nearest_site_id":"L2","e_left_wh":28.69,"e_need_wh":6.3},
        {"s_m":1110.0,"t_s":92.5,"margin_wh":14.51,"nearest_site_id":"L2","e_left_wh":28.67,"e_need_wh":6.16},
        {"s_m":1125.0,"t_s":93.8,"margin_wh":14.63,"nearest_site_id":"L2","e_left_wh":28.65,"e_need_wh":6.02},
        {"s_m":1140.0,"t_s":95.0,"margin_wh":14.76,"nearest_site_id":"L2","e_left_wh":28.63,"e_need_wh":5.88},
        {"s_m":1155.0,"t_s":96.2,"margin_wh":14.88,"nearest_site_id":"L2","e_left_wh":28.61,"e_need_wh":5.74},
        {"s_m":1170.0,"t_s":97.5,"margin_wh":14.99,"nearest_site_id":"L2","e_left_wh":28.6,"e_need_wh":5.6},
        {"s_m":1185.0,"t_s":98.8,"margin_wh":15.11,"nearest_site_id":"L2","e_left_wh":28.58,"e_need_wh":5.47},
        {"s_m":1200.0,"t_s":100.0,"margin_wh":15.23,"nearest_site_id":"L2","e_left_wh":28.56,"e_need_wh":5.33},
        {"s_m":1215.0,"t_s":101.2,"margin_wh":15.34,"nearest_site_id":"L2","e_left_wh":28.54,"e_need_wh":5.2},
        {"s_m":1230.0,"t_s":102.5,"margin_wh":15.45,"nearest_site_id":"L2","e_left_wh":28.52,"e_need_wh":5.07},
        {"s_m":1245.0,"t_s":103.8,"margin_wh":15.56,"nearest_site_id":"L2","e_left_wh":28.51,"e_need_wh":4.94},
        {"s_m":1260.0,"t_s":105.0,"margin_wh":15.67,"nearest_site_id":"L2","e_left_wh":28.49,"e_need_wh":4.82},
        {"s_m":1275.0,"t_s":106.2,"margin_wh":15.78,"nearest_site_id":"L2","e_left_wh":28.47,"e_need_wh":4.69},
        {"s_m":1290.0,"t_s":107.5,"margin_wh":15.88,"nearest_site_id":"L2","e_left_wh":28.45,"e_need_wh":4.57},
        {"s_m":1305.0,"t_s":108.8,"margin_wh":15.97,"nearest_site_id":"L2","e_left_wh":28.43,"e_need_wh":4.46},
        {"s_m":1320.0,"t_s":110.0,"margin_wh":16.07,"nearest_site_id":"L2","e_left_wh":28.42,"e_need_wh":4.35},
        {"s_m":1335.0,"t_s":111.2,"margin_wh":16.15,"nearest_site_id":"L2","e_left_wh":28.4,"e_need_wh":4.25},
        {"s_m":1350.0,"t_s":112.5,"margin_wh":16.23,"nearest_site_id":"L2","e_left_wh":28.38,"e_need_wh":4.15},
        {"s_m":1365.0,"t_s":113.8,"margin_wh":16.3,"nearest_site_id":"L2","e_left_wh":28.36,"e_need_wh":4.06},
        {"s_m":1380.0,"t_s":115.0,"margin_wh":16.36,"nearest_site_id":"L2","e_left_wh":28.34,"e_need_wh":3.98},
        {"s_m":1395.0,"t_s":116.2,"margin_wh":16.41,"nearest_site_id":"L2","e_left_wh":28.33,"e_need_wh":3.92},
        {"s_m":1410.0,"t_s":117.5,"margin_wh":16.34,"nearest_site_id":"L2","e_left_wh":28.31,"e_need_wh":3.97},
        {"s_m":1425.0,"t_s":118.8,"margin_wh":16.18,"nearest_site_id":"L2","e_left_wh":28.29,"e_need_wh":4.11},
        {"s_m":1440.0,"t_s":120.0,"margin_wh":16.02,"nearest_site_id":"L2","e_left_wh":28.27,"e_need_wh":4.26},
        {"s_m":1455.0,"t_s":121.2,"margin_wh":15.85,"nearest_site_id":"L2","e_left_wh":28.25,"e_need_wh":4.4},
        {"s_m":1470.0,"t_s":122.5,"margin_wh":15.69,"nearest_site_id":"L2","e_left_wh":28.24,"e_need_wh":4.55},
        {"s_m":1485.0,"t_s":123.8,"margin_wh":15.53,"nearest_site_id":"L2","e_left_wh":28.22,"e_need_wh":4.69},
        {"s_m":1500.0,"t_s":125.0,"margin_wh":15.36,"nearest_site_id":"L2","e_left_wh":28.2,"e_need_wh":4.84},
        {"s_m":1515.0,"t_s":126.2,"margin_wh":15.2,"nearest_site_id":"L2","e_left_wh":28.18,"e_need_wh":4.98},
        {"s_m":1530.0,"t_s":127.5,"margin_wh":15.03,"nearest_site_id":"L2","e_left_wh":28.16,"e_need_wh":5.13},
        {"s_m":1545.0,"t_s":128.8,"margin_wh":14.87,"nearest_site_id":"L2","e_left_wh":28.15,"e_need_wh":5.28},
        {"s_m":1560.0,"t_s":130.0,"margin_wh":14.7,"nearest_site_id":"L2","e_left_wh":28.13,"e_need_wh":5.43},
        {"s_m":1575.0,"t_s":131.2,"margin_wh":14.54,"nearest_site_id":"L2","e_left_wh":28.11,"e_need_wh":5.57},
        {"s_m":1590.0,"t_s":132.5,"margin_wh":14.37,"nearest_site_id":"L2","e_left_wh":28.09,"e_need_wh":5.72},
        {"s_m":1605.0,"t_s":133.8,"margin_wh":14.2,"nearest_site_id":"L2","e_left_wh":28.07,"e_need_wh":5.87},
        {"s_m":1620.0,"t_s":135.0,"margin_wh":14.04,"nearest_site_id":"L2","e_left_wh":28.06,"e_need_wh":6.02},
        {"s_m":1635.0,"t_s":136.2,"margin_wh":13.87,"nearest_site_id":"L2","e_left_wh":28.04,"e_need_wh":6.17},
        {"s_m":1650.0,"t_s":137.5,"margin_wh":13.7,"nearest_site_id":"L2","e_left_wh":28.02,"e_need_wh":6.32},
        {"s_m":1665.0,"t_s":138.8,"margin_wh":13.54,"nearest_site_id":"L2","e_left_wh":28.0,"e_need_wh":6.47},
        {"s_m":1680.0,"t_s":140.0,"margin_wh":13.46,"nearest_site_id":"L2","e_left_wh":27.98,"e_need_wh":6.52},
        {"s_m":1695.0,"t_s":141.2,"margin_wh":13.46,"nearest_site_id":"L2","e_left_wh":27.97,"e_need_wh":6.51},
        {"s_m":1710.0,"t_s":142.5,"margin_wh":13.45,"nearest_site_id":"L2","e_left_wh":27.95,"e_need_wh":6.5},
        {"s_m":1725.0,"t_s":143.8,"margin_wh":13.43,"nearest_site_id":"L2","e_left_wh":27.93,"e_need_wh":6.5},
        {"s_m":1740.0,"t_s":145.0,"margin_wh":13.41,"nearest_site_id":"L2","e_left_wh":27.91,"e_need_wh":6.5},
        {"s_m":1755.0,"t_s":146.2,"margin_wh":13.38,"nearest_site_id":"L2","e_left_wh":27.89,"e_need_wh":6.51},
        {"s_m":1770.0,"t_s":147.5,"margin_wh":13.35,"nearest_site_id":"L2","e_left_wh":27.88,"e_need_wh":6.53},
        {"s_m":1785.0,"t_s":148.8,"margin_wh":13.31,"nearest_site_id":"L2","e_left_wh":27.86,"e_need_wh":6.55},
        {"s_m":1800.0,"t_s":150.0,"margin_wh":13.26,"nearest_site_id":"L2","e_left_wh":27.84,"e_need_wh":6.58},
        {"s_m":1815.0,"t_s":151.2,"margin_wh":13.21,"nearest_site_id":"L2","e_left_wh":27.82,"e_need_wh":6.61},
        {"s_m":1830.0,"t_s":152.5,"margin_wh":13.16,"nearest_site_id":"L2","e_left_wh":27.8,"e_need_wh":6.64},
        {"s_m":1845.0,"t_s":153.8,"margin_wh":13.1,"nearest_site_id":"L2","e_left_wh":27.79,"e_need_wh":6.69},
        {"s_m":1860.0,"t_s":155.0,"margin_wh":13.04,"nearest_site_id":"L2","e_left_wh":27.77,"e_need_wh":6.73},
        {"s_m":1875.0,"t_s":156.2,"margin_wh":12.97,"nearest_site_id":"L2","e_left_wh":27.75,"e_need_wh":6.78},
        {"s_m":1890.0,"t_s":157.5,"margin_wh":12.89,"nearest_site_id":"L2","e_left_wh":27.73,"e_need_wh":6.84},
        {"s_m":1905.0,"t_s":158.8,"margin_wh":12.81,"nearest_site_id":"L2","e_left_wh":27.71,"e_need_wh":6.9},
        {"s_m":1920.0,"t_s":160.0,"margin_wh":12.73,"nearest_site_id":"L2","e_left_wh":27.7,"e_need_wh":6.96},
        {"s_m":1935.0,"t_s":161.2,"margin_wh":12.64,"nearest_site_id":"L2","e_left_wh":27.68,"e_need_wh":7.03},
        {"s_m":1950.0,"t_s":162.5,"margin_wh":12.55,"nearest_site_id":"L2","e_left_wh":27.66,"e_need_wh":7.11},
        {"s_m":1965.0,"t_s":163.8,"margin_wh":12.46,"nearest_site_id":"L2","e_left_wh":27.64,"e_need_wh":7.18},
        {"s_m":1980.0,"t_s":165.0,"margin_wh":12.36,"nearest_site_id":"L2","e_left_wh":27.62,"e_need_wh":7.26},
        {"s_m":1995.0,"t_s":166.2,"margin_wh":12.26,"nearest_site_id":"L2","e_left_wh":27.61,"e_need_wh":7.34},
        {"s_m":2010.0,"t_s":167.5,"margin_wh":12.16,"nearest_site_id":"L2","e_left_wh":27.59,"e_need_wh":7.43},
        {"s_m":2025.0,"t_s":168.8,"margin_wh":12.05,"nearest_site_id":"L2","e_left_wh":27.57,"e_need_wh":7.52},
        {"s_m":2040.0,"t_s":170.0,"margin_wh":11.94,"nearest_site_id":"L2","e_left_wh":27.55,"e_need_wh":7.61},
        {"s_m":2055.0,"t_s":171.2,"margin_wh":11.83,"nearest_site_id":"L2","e_left_wh":27.53,"e_need_wh":7.71},
        {"s_m":2070.0,"t_s":172.5,"margin_wh":11.71,"nearest_site_id":"L2","e_left_wh":27.52,"e_need_wh":7.8},
        {"s_m":2085.0,"t_s":173.8,"margin_wh":11.59,"nearest_site_id":"L2","e_left_wh":27.5,"e_need_wh":7.9},
        {"s_m":2100.0,"t_s":175.0,"margin_wh":11.47,"nearest_site_id":"L2","e_left_wh":27.48,"e_need_wh":8.01},
        {"s_m":2115.0,"t_s":176.2,"margin_wh":11.35,"nearest_site_id":"L2","e_left_wh":27.46,"e_need_wh":8.11},
        {"s_m":2130.0,"t_s":177.5,"margin_wh":11.23,"nearest_site_id":"L2","e_left_wh":27.44,"e_need_wh":8.22},
        {"s_m":2145.0,"t_s":178.8,"margin_wh":11.1,"nearest_site_id":"L2","e_left_wh":27.43,"e_need_wh":8.32},
        {"s_m":2160.0,"t_s":180.0,"margin_wh":10.97,"nearest_site_id":"L2","e_left_wh":27.41,"e_need_wh":8.43},
        {"s_m":2175.0,"t_s":181.2,"margin_wh":10.84,"nearest_site_id":"L2","e_left_wh":27.39,"e_need_wh":8.55},
        {"s_m":2190.0,"t_s":182.5,"margin_wh":10.71,"nearest_site_id":"L2","e_left_wh":27.37,"e_need_wh":8.66},
        {"s_m":2205.0,"t_s":183.8,"margin_wh":10.58,"nearest_site_id":"L2","e_left_wh":27.35,"e_need_wh":8.77},
        {"s_m":2220.0,"t_s":185.0,"margin_wh":10.45,"nearest_site_id":"L2","e_left_wh":27.34,"e_need_wh":8.89},
        {"s_m":2235.0,"t_s":186.2,"margin_wh":10.31,"nearest_site_id":"L2","e_left_wh":27.32,"e_need_wh":9.01},
        {"s_m":2250.0,"t_s":187.5,"margin_wh":10.17,"nearest_site_id":"L2","e_left_wh":27.3,"e_need_wh":9.13},
        {"s_m":2265.0,"t_s":188.8,"margin_wh":10.03,"nearest_site_id":"L2","e_left_wh":27.28,"e_need_wh":9.25},
        {"s_m":2280.0,"t_s":190.0,"margin_wh":9.9,"nearest_site_id":"L2","e_left_wh":27.26,"e_need_wh":9.37},
        {"s_m":2295.0,"t_s":191.2,"margin_wh":9.76,"nearest_site_id":"L2","e_left_wh":27.25,"e_need_wh":9.49},
        {"s_m":2310.0,"t_s":192.5,"margin_wh":9.61,"nearest_site_id":"L2","e_left_wh":27.23,"e_need_wh":9.61},
        {"s_m":2321.64,"t_s":193.5,"margin_wh":9.5,"nearest_site_id":"L2","e_left_wh":27.21,"e_need_wh":9.71}
      ],
      "is_simulated": true
    }
  ],
  "events": [
    {
      "event_id": "EV-S2-01-R01",
      "kind": "restriction_zone",
      "task_id": "T-S2-01",
      "label": "R01 限制区生效 0–120 m",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              1300,
              1300
            ],
            [
              1700,
              1300
            ],
            [
              1700,
              1700
            ],
            [
              1300,
              1700
            ],
            [
              1300,
              1300
            ]
          ]
        ]
      },
      "alt_min_m": 0,
      "alt_max_m": 120,
      "at_s": 40,
      "effective_from": "2026-11-10T00:00:40Z",
      "effective_until": null,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S2-01-WIND",
      "kind": "wind",
      "task_id": "T-S2-01",
      "label": "中段阵风增强（构造）",
      "geometry": {},
      "alt_min_m": null,
      "alt_max_m": null,
      "at_s": 60,
      "effective_from": "2026-11-10T00:01:00Z",
      "effective_until": "2026-11-10T00:02:30Z",
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S2-01-PLAN-V2",
      "kind": "plan_version_change",
      "task_id": "T-S2-01",
      "label": "改线 v1 → v2（避开 R01，备降余量恢复非负）",
      "geometry": {},
      "alt_min_m": null,
      "alt_max_m": null,
      "at_s": 52,
      "effective_from": "2026-11-10T00:00:52Z",
      "effective_until": null,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true,
      "from_version": "v1",
      "to_version": "v2"
    },
    {
      "event_id": "EV-S2-04-R01",
      "kind": "restriction_zone",
      "task_id": "T-S2-04",
      "label": "R01 起飞前已生效（静态限制区）",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              1300,
              1300
            ],
            [
              1700,
              1300
            ],
            [
              1700,
              1700
            ],
            [
              1300,
              1700
            ],
            [
              1300,
              1300
            ]
          ]
        ]
      },
      "alt_min_m": 0,
      "alt_max_m": 120,
      "at_s": 0,
      "effective_from": "2026-11-10T00:00:00Z",
      "effective_until": null,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S3-03-LINK",
      "kind": "link_degradation",
      "task_id": "T-S3-03",
      "label": "云边链路中断 50–170 s",
      "geometry": {},
      "alt_min_m": null,
      "alt_max_m": null,
      "at_s": 50,
      "effective_from": "2026-11-10T00:00:50Z",
      "effective_until": "2026-11-10T00:02:50Z",
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S3-03-R03",
      "kind": "restriction_zone",
      "task_id": "T-S3-03",
      "label": "R03 在断连期间生效 0–120 m",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              900,
              1800
            ],
            [
              1300,
              1800
            ],
            [
              1300,
              2200
            ],
            [
              900,
              2200
            ],
            [
              900,
              1800
            ]
          ]
        ]
      },
      "alt_min_m": 0,
      "alt_max_m": 120,
      "at_s": 80,
      "effective_from": "2026-11-10T00:01:20Z",
      "effective_until": null,
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S3-03-L2",
      "kind": "landing_site_change",
      "task_id": "T-S3-03",
      "label": "L2 短时被占用（备降点变化）",
      "geometry": {
        "type": "Point",
        "coordinates": [
          1900.0,
          1900.0
        ]
      },
      "alt_min_m": null,
      "alt_max_m": null,
      "at_s": 95,
      "effective_from": "2026-11-10T00:01:35Z",
      "effective_until": "2026-11-10T00:02:15Z",
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    },
    {
      "event_id": "EV-S3-03-BATT",
      "kind": "battery_anomaly",
      "task_id": "T-S3-03",
      "label": "电池组电压抖动（构造）",
      "geometry": {},
      "alt_min_m": null,
      "alt_max_m": null,
      "at_s": 110,
      "effective_from": "2026-11-10T00:01:50Z",
      "effective_until": "2026-11-10T00:02:30Z",
      "provenance": {
        "source": "sim:scenario_v0",
        "version": "v0-draft",
        "captured_at": "2026-11-10T00:00:00Z",
        "valid_from": null,
        "valid_until": null,
        "is_simulated": true,
        "uncertainty_note": "构造的 SITL 演示任务，数值用于展示，不作为性能结论"
      },
      "is_simulated": true
    }
  ],
  "telemetry": [
    {
      "task_id": "T-S2-01",
      "route_id": "RT-S2-01-B",
      "samples": [
        {"ts":"2026-11-10T00:00:00Z","at_s":0.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":300.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":30.0,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:07Z","at_s":7.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":384.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.9,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:14Z","at_s":14.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":468.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.8,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:21Z","at_s":21.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":552.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.7,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:28Z","at_s":28.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":636.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.6,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:35Z","at_s":35.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":720.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.5,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:42Z","at_s":42.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":804.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.4,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:49Z","at_s":49.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":888.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.29,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:56Z","at_s":56.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":972.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.19,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:03Z","at_s":63.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1056.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":29.09,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:10Z","at_s":70.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1140.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.99,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:17Z","at_s":77.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1224.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.89,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:24Z","at_s":84.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1308.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.79,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:31Z","at_s":91.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1392.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.69,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:38Z","at_s":98.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1476.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.59,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:45Z","at_s":105.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1560.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.49,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:52Z","at_s":112.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1644.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.39,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:59Z","at_s":119.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1728.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.29,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:06Z","at_s":126.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1812.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.19,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:13Z","at_s":133.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1896.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":28.08,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:20Z","at_s":140.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":1980.0,"y_m":300.0},"groundspeed_mps":12.0,"energy_remaining_wh":27.98,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:27Z","at_s":147.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":2050.0,"y_m":314.0},"groundspeed_mps":12.0,"energy_remaining_wh":27.88,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:34Z","at_s":154.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":2050.0,"y_m":398.0},"groundspeed_mps":12.0,"energy_remaining_wh":27.78,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:41Z","at_s":161.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":2050.0,"y_m":482.0},"groundspeed_mps":12.0,"energy_remaining_wh":27.68,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:48Z","at_s":168.0,"position":{"frame":"enu_m","alt_m":30.0,"alt_ref":"agl","x_m":2050.0,"y_m":566.0},"groundspeed_mps":12.0,"energy_remaining_wh":27.58,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v2","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}}
      ],
      "is_simulated": true
    },
    {
      "task_id": "T-S3-03",
      "route_id": "RT-S3-03-A",
      "samples": [
        {"ts":"2026-11-10T00:00:00Z","at_s":0.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":600.0,"y_m":600.0},"groundspeed_mps":12.0,"energy_remaining_wh":30.0,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:07Z","at_s":7.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":659.4,"y_m":659.4},"groundspeed_mps":12.0,"energy_remaining_wh":29.9,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:14Z","at_s":14.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":718.79,"y_m":718.79},"groundspeed_mps":12.0,"energy_remaining_wh":29.8,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:21Z","at_s":21.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":778.19,"y_m":778.19},"groundspeed_mps":12.0,"energy_remaining_wh":29.7,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":95,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:28Z","at_s":28.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":837.59,"y_m":837.59},"groundspeed_mps":12.0,"energy_remaining_wh":29.6,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":96,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:35Z","at_s":35.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":896.98,"y_m":896.98},"groundspeed_mps":12.0,"energy_remaining_wh":29.5,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":92,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:42Z","at_s":42.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":956.38,"y_m":956.38},"groundspeed_mps":12.0,"energy_remaining_wh":29.4,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":93,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:49Z","at_s":49.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1015.78,"y_m":1015.78},"groundspeed_mps":12.0,"energy_remaining_wh":29.29,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":94,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:00:56Z","at_s":56.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1075.18,"y_m":1075.18},"groundspeed_mps":12.0,"energy_remaining_wh":29.19,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:03Z","at_s":63.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1148.89},"groundspeed_mps":12.0,"energy_remaining_wh":29.09,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:10Z","at_s":70.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1232.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.99,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:17Z","at_s":77.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1316.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.89,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:24Z","at_s":84.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1400.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.79,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:31Z","at_s":91.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1484.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.69,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:38Z","at_s":98.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1568.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.59,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:45Z","at_s":105.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1652.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.49,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:52Z","at_s":112.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1736.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.39,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:01:59Z","at_s":119.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1820.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.29,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:06Z","at_s":126.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1904.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.19,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:13Z","at_s":133.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1100.0,"y_m":1988.89},"groundspeed_mps":12.0,"energy_remaining_wh":28.08,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:20Z","at_s":140.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1169.67,"y_m":2021.44},"groundspeed_mps":12.0,"energy_remaining_wh":27.98,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:27Z","at_s":147.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1249.96,"y_m":2046.14},"groundspeed_mps":12.0,"energy_remaining_wh":27.88,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:34Z","at_s":154.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1330.24,"y_m":2070.84},"groundspeed_mps":12.0,"energy_remaining_wh":27.78,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:41Z","at_s":161.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1410.53,"y_m":2095.55},"groundspeed_mps":12.0,"energy_remaining_wh":27.68,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}},
        {"ts":"2026-11-10T00:02:48Z","at_s":168.0,"position":{"frame":"enu_m","alt_m":35.0,"alt_ref":"agl","x_m":1490.81,"y_m":2120.25},"groundspeed_mps":12.0,"energy_remaining_wh":27.58,"flight_mode":"AUTO.MISSION","gps_fix":"3d_fix","link_quality_pct":28,"executing_plan_version":"v1","provenance":{"source":"sim:scenario_v0","version":"v0-draft","captured_at":"2026-11-10T00:00:00Z","valid_from":null,"valid_until":null,"is_simulated":true,"uncertainty_note":"构造的 SITL 演示任务，数值用于展示，不作为性能结论"}}
      ],
      "is_simulated": true
    }
  ],
  "kpi_baseline": {
    "tasks_total": 5,
    "in_flight": 2,
    "min_margin_wh": -4.09,
    "link_quality_pct": 87,
    "simulated_ratio_pct": 100
  }
};

/*
 * 全局只读查询 API（C-SCENE-API@1）。
 * 约定：
 *   - 所有返回值都是只读安全：数据本身已被深层冻结；插值/聚合结果返回新对象。
 *   - 坐标转换只在此处实现一次，页面不得自行重算。
 *   - 未知 id 一律返回空结果（数组/0/null），不抛异常中断页面。
 */
(function (global) {
  'use strict';

  var DATA = global.LOWALT_SCENE_DATA;
  if (!DATA) {
    if (global.console && typeof global.console.error === 'function') {
      global.console.error('[LOWALT_SCENE_API] 缺少 LOWALT_SCENE_DATA，scene.js 加载顺序有误');
    }
    return;
  }

  var CRS = DATA.crs;
  var BASE_MS = Date.parse('2026-11-10T00:00:00Z');
  var DEMO_GROUNDSPEED_MPS = 12.0;

  /** 演示时钟周期（秒），与 eval/scenarios/v0.yaml 的 at_s 基准一致 */
  var CYCLE_S = 180;
  /** 演示播放倍速 */
  var DEMO_CLOCK_SPEED = 6;

  // ---- 深层冻结：数据与数组一律不可原地修改 ----
  function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      deepFreeze(value[keys[i]]);
    }
    return value;
  }

  deepFreeze(DATA);

  // ---- 索引（闭包内私有，不挂到全局） ----
  var TASK_BY_ID = Object.create(null);
  var SITE_BY_ID = Object.create(null);
  var ROUTE_BY_ID = Object.create(null);
  var PROFILE_BY_ROUTE = Object.create(null);
  var ROUTES_BY_TASK = Object.create(null);
  var TELEMETRY_BY_TASK = Object.create(null);
  var GEOM_BY_ROUTE = Object.create(null);
  var warnedRoutes = Object.create(null);
  var i;
  var j;

  for (i = 0; i < DATA.tasks.length; i += 1) {
    TASK_BY_ID[DATA.tasks[i].task_id] = DATA.tasks[i];
  }
  for (i = 0; i < DATA.sites.length; i += 1) {
    SITE_BY_ID[DATA.sites[i].site_id] = DATA.sites[i];
  }
  for (i = 0; i < DATA.margin_profiles.length; i += 1) {
    PROFILE_BY_ROUTE[DATA.margin_profiles[i].route_id] = DATA.margin_profiles[i];
  }
  for (i = 0; i < DATA.telemetry.length; i += 1) {
    TELEMETRY_BY_TASK[DATA.telemetry[i].task_id] = DATA.telemetry[i];
  }

  function bearingDeg(dx, dy) {
    // ENU：x 向东、y 向北；方位角 0 = 正北，顺时针递增
    var deg = Math.atan2(dx, dy) * 180 / Math.PI;
    return (deg + 360) % 360;
  }

  function buildGeom(route) {
    var pts = [];
    var k;
    for (k = 0; k < route.waypoints.length; k += 1) {
      var wp = route.waypoints[k];
      pts.push({ x_m: wp.x_m, y_m: wp.y_m, alt_m: wp.alt_m });
    }
    var segs = [];
    var total = 0;
    for (k = 0; k + 1 < pts.length; k += 1) {
      var a = pts[k];
      var b = pts[k + 1];
      var dx = b.x_m - a.x_m;
      var dy = b.y_m - a.y_m;
      var len = Math.sqrt(dx * dx + dy * dy);
      segs.push({ a: a, b: b, len: len, start: total, bearing: bearingDeg(dx, dy) });
      total += len;
    }
    return { pts: pts, segs: segs, total: total };
  }

  for (i = 0; i < DATA.routes.length; i += 1) {
    var route = DATA.routes[i];
    ROUTE_BY_ID[route.route_id] = route;
    GEOM_BY_ROUTE[route.route_id] = buildGeom(route);
    if (!ROUTES_BY_TASK[route.task_id]) {
      ROUTES_BY_TASK[route.task_id] = [];
    }
    ROUTES_BY_TASK[route.task_id].push(route);
  }
  var taskIds = Object.keys(ROUTES_BY_TASK);
  for (i = 0; i < taskIds.length; i += 1) {
    ROUTES_BY_TASK[taskIds[i]].sort(function (left, right) {
      return String(left.plan_version).localeCompare(String(right.plan_version), 'en');
    });
  }

  function warnUnknownRoute(route_id) {
    var key = String(route_id);
    if (warnedRoutes[key]) {
      return;
    }
    warnedRoutes[key] = true;
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn('[LOWALT_SCENE_API] 未知 route_id：' + key + '，返回空结果');
    }
  }

  function assertFiniteNumber(value, name) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new RangeError(name + ' 必须是有限数，收到：' + String(value));
    }
  }

  function enuToLngLat(x_m, y_m) {
    assertFiniteNumber(x_m, 'x_m');
    assertFiniteNumber(y_m, 'y_m');
    return [
      CRS.origin_lon_deg + x_m / CRS.meters_per_deg_lon,
      CRS.origin_lat_deg + y_m / CRS.meters_per_deg_lat
    ];
  }

  function lngLatToEnu(lng, lat) {
    assertFiniteNumber(lng, 'lng');
    assertFiniteNumber(lat, 'lat');
    return {
      x_m: (lng - CRS.origin_lon_deg) * CRS.meters_per_deg_lon,
      y_m: (lat - CRS.origin_lat_deg) * CRS.meters_per_deg_lat
    };
  }

  function routePolylineEnu(route_id) {
    if (!ROUTE_BY_ID[route_id]) {
      warnUnknownRoute(route_id);
      return [];
    }
    var geom = GEOM_BY_ROUTE[route_id];
    var out = [];
    for (var k = 0; k < geom.pts.length; k += 1) {
      out.push({ x_m: geom.pts[k].x_m, y_m: geom.pts[k].y_m, alt_m: geom.pts[k].alt_m });
    }
    return out;
  }

  function routePolylineLngLat(route_id) {
    var enu = routePolylineEnu(route_id);
    var out = [];
    for (var k = 0; k < enu.length; k += 1) {
      var ll = enuToLngLat(enu[k].x_m, enu[k].y_m);
      out.push([ll[0], ll[1], enu[k].alt_m]);
    }
    return out;
  }

  function routeLengthM(route_id) {
    if (!ROUTE_BY_ID[route_id]) {
      warnUnknownRoute(route_id);
      return 0;
    }
    return Math.round(GEOM_BY_ROUTE[route_id].total * 1000) / 1000;
  }

  function sampleRouteAt(route_id, s_m) {
    if (!ROUTE_BY_ID[route_id]) {
      warnUnknownRoute(route_id);
      return null;
    }
    var geom = GEOM_BY_ROUTE[route_id];
    var s = Number(s_m);
    if (!isFinite(s)) {
      s = 0;
    }
    var total = geom.total;
    if (s < 0) {
      s = 0;
    }
    if (s > total) {
      s = total;
    }
    var segs = geom.segs;
    if (segs.length === 0) {
      var only = geom.pts[0];
      return { x_m: only.x_m, y_m: only.y_m, alt_m: only.alt_m, bearing_deg: 0 };
    }
    var chosen = segs[segs.length - 1];
    for (var k = 0; k < segs.length; k += 1) {
      if (s <= segs[k].start + segs[k].len + 1e-9) {
        chosen = segs[k];
        break;
      }
    }
    var f = chosen.len === 0 ? 0 : (s - chosen.start) / chosen.len;
    return {
      x_m: chosen.a.x_m + (chosen.b.x_m - chosen.a.x_m) * f,
      y_m: chosen.a.y_m + (chosen.b.y_m - chosen.a.y_m) * f,
      alt_m: chosen.a.alt_m + (chosen.b.alt_m - chosen.a.alt_m) * f,
      bearing_deg: chosen.bearing
    };
  }

  function routeDurationS(route_id) {
    if (!ROUTE_BY_ID[route_id]) {
      warnUnknownRoute(route_id);
      return 0;
    }
    return Math.round(GEOM_BY_ROUTE[route_id].total / DEMO_GROUNDSPEED_MPS * 10) / 10;
  }

  function getTask(task_id) {
    return TASK_BY_ID[task_id] || null;
  }

  function getRoutesForTask(task_id) {
    var list = ROUTES_BY_TASK[task_id];
    return list ? list.slice() : [];
  }

  function getProfile(route_id) {
    return PROFILE_BY_ROUTE[route_id] || null;
  }

  function getEventsSortedDesc() {
    var copy = DATA.events.slice();
    copy.sort(function (left, right) {
      var a = typeof left.at_s === 'number' ? left.at_s : 0;
      var b = typeof right.at_s === 'number' ? right.at_s : 0;
      if (b !== a) {
        return b - a;
      }
      return String(left.event_id).localeCompare(String(right.event_id), 'en');
    });
    return copy;
  }

  function isoAt(atSeconds) {
    return new Date(BASE_MS + Math.round(atSeconds * 1000)).toISOString();
  }

  function cloneState(src, atSeconds, x, y, alt, energy, link, gs) {
    return {
      ts: isoAt(atSeconds),
      at_s: atSeconds,
      position: { frame: 'enu_m', alt_m: alt, alt_ref: 'agl', x_m: x, y_m: y },
      groundspeed_mps: gs,
      energy_remaining_wh: energy,
      flight_mode: src.flight_mode,
      gps_fix: src.gps_fix,
      link_quality_pct: link,
      executing_plan_version: src.executing_plan_version,
      provenance: src.provenance,
      is_simulated: true
    };
  }

  function getVehicleAt(task_id, t_s) {
    var entry = TELEMETRY_BY_TASK[task_id];
    if (!entry || !entry.samples || entry.samples.length === 0) {
      return null;
    }
    var samples = entry.samples;
    var t = Number(t_s);
    if (!isFinite(t)) {
      t = 0;
    }
    var first = samples[0];
    var last = samples[samples.length - 1];
    if (t <= first.at_s) {
      return cloneState(first, first.at_s, first.position.x_m, first.position.y_m,
        first.position.alt_m, first.energy_remaining_wh, first.link_quality_pct,
        first.groundspeed_mps);
    }
    if (t >= last.at_s) {
      return cloneState(last, last.at_s, last.position.x_m, last.position.y_m,
        last.position.alt_m, last.energy_remaining_wh, last.link_quality_pct,
        last.groundspeed_mps);
    }
    var lo = 0;
    for (var k = 1; k < samples.length; k += 1) {
      if (samples[k].at_s >= t) {
        lo = k - 1;
        break;
      }
    }
    var a = samples[lo];
    var b = samples[lo + 1];
    var span = b.at_s - a.at_s;
    var f = span > 0 ? (t - a.at_s) / span : 0;
    return cloneState(
      a,
      t,
      a.position.x_m + (b.position.x_m - a.position.x_m) * f,
      a.position.y_m + (b.position.y_m - a.position.y_m) * f,
      a.position.alt_m + (b.position.alt_m - a.position.alt_m) * f,
      a.energy_remaining_wh + (b.energy_remaining_wh - a.energy_remaining_wh) * f,
      a.link_quality_pct + (b.link_quality_pct - a.link_quality_pct) * f,
      a.groundspeed_mps + (b.groundspeed_mps - a.groundspeed_mps) * f
    );
  }

  function eventWindowEndS(event) {
    if (!event.effective_until) {
      return Infinity;
    }
    var endMs = Date.parse(event.effective_until);
    if (!isFinite(endMs)) {
      return Infinity;
    }
    return (endMs - BASE_MS) / 1000;
  }

  function geometryMatchesSite(geometry, site) {
    if (!geometry || geometry.type !== 'Point' || !geometry.coordinates) {
      return false;
    }
    var pt = geometry.coordinates;
    return Math.abs(pt[0] - site.x_m) < 1e-9 && Math.abs(pt[1] - site.y_m) < 1e-9;
  }

  function getSiteStatus(site_id, t_s) {
    var site = SITE_BY_ID[site_id];
    if (!site) {
      return { status: 'occupied', reason: 'unknown site' };
    }
    var t = Number(t_s);
    if (!isFinite(t)) {
      t = 0;
    }
    if (site.occupied === true) {
      return { status: 'occupied', reason: '源字段 occupied = true，该点当前被占用' };
    }
    for (var k = 0; k < DATA.events.length; k += 1) {
      var ev = DATA.events[k];
      if (ev.kind !== 'landing_site_change' || typeof ev.at_s !== 'number') {
        continue;
      }
      if (t < ev.at_s || t >= eventWindowEndS(ev)) {
        continue;
      }
      if (geometryMatchesSite(ev.geometry, site)) {
        return {
          status: 'occupied',
          reason: ev.label || '该备降点在演示时段内被占用'
        };
      }
    }
    return {
      status: 'available',
      reason: '可用（降落半径 ' + site.radius_m + ' m）'
    };
  }

  function computeKpis(t_s) {
    var t = Number(t_s);
    if (!isFinite(t)) {
      t = 0;
    }
    var tasksTotal = DATA.tasks.length;
    var inFlight = 0;
    for (var k = 0; k < DATA.tasks.length; k += 1) {
      if (DATA.tasks[k].status === 'in_flight') {
        inFlight += 1;
      }
    }
    var minMargin = null;
    for (var p = 0; p < DATA.margin_profiles.length; p += 1) {
      var samples = DATA.margin_profiles[p].samples;
      for (var s = 0; s < samples.length; s += 1) {
        var m = samples[s].margin_wh;
        if (minMargin === null || m < minMargin) {
          minMargin = m;
        }
      }
    }
    var linkQuality = 87;
    for (var e = 0; e < DATA.events.length; e += 1) {
      var ev = DATA.events[e];
      if (ev.kind !== 'link_degradation' || typeof ev.at_s !== 'number') {
        continue;
      }
      if (t >= ev.at_s && t < eventWindowEndS(ev)) {
        linkQuality = 28;
        break;
      }
    }
    return {
      tasks_total: tasksTotal,
      in_flight: inFlight,
      min_margin_wh: minMargin === null ? null : Math.round(minMargin * 100) / 100,
      link_quality_pct: linkQuality,
      simulated_ratio_pct: 100
    };
  }

  var api = {
    enuToLngLat: enuToLngLat,
    lngLatToEnu: lngLatToEnu,
    routePolylineEnu: routePolylineEnu,
    routePolylineLngLat: routePolylineLngLat,
    routeLengthM: routeLengthM,
    sampleRouteAt: sampleRouteAt,
    routeDurationS: routeDurationS,
    getTask: getTask,
    getRoutesForTask: getRoutesForTask,
    getProfile: getProfile,
    getEventsSortedDesc: getEventsSortedDesc,
    getVehicleAt: getVehicleAt,
    getSiteStatus: getSiteStatus,
    computeKpis: computeKpis,
    CYCLE_S: CYCLE_S,
    DEMO_CLOCK_SPEED: DEMO_CLOCK_SPEED
  };

  global.LOWALT_SCENE_API = Object.freeze(api);
})(
  typeof window !== 'undefined' ? window : globalThis
);
