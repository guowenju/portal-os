const zh = {
  desktop: {
    header: {
      showDesktop: '显示桌面',
      appLibrary: '应用库',
      contextMenu: {
        addToDesktop: '添加到桌面',
        alreadyOnDesktop: '已在桌面',
        viewDetails: '查看详情',
        deleteShortcut: '删除快捷方式',
      },
    },
    window: {
      close: '关闭',
      minimize: '最小化',
      maximize: '最大化',
      loadingApp: '正在打开应用...',
    },
    pet: {
      goldenRetriever: '金毛桌面宠物',
      weatherLoading: '我正在扒着窗边看天气，等我一下下...',
      weatherSummary: '{location} {temperature}{unit}，{condition}',
      weatherUnavailable: '我刚刚没看清天空，天气等会儿再告诉你。',
      weatherUnset: '我会先自动看看你附近的天气，失败时再请你在设置里告诉我城市。',
      contextMenu: {
        reportWeather: '播报天气',
        returnToCorner: '回到角落',
      },
      weatherDetail: {
        humidity: '湿度 {humidity}%',
        wind: '{wind}',
        suffix: '；{details}',
      },
      weatherSpeech: {
        clear:
          '{location} 现在 {temperature}{unit}，{condition}。阳光看起来很温柔，适合慢慢散步{details}。',
        cloudy:
          '{location} 现在 {temperature}{unit}，{condition}。云朵把天空垫得软软的，出门也挺舒服{details}。',
        fog: '{location} 现在 {temperature}{unit}，{condition}。外面有点朦胧，走路记得慢一点{details}。',
        rain: '{location} 现在 {temperature}{unit}，{condition}。我闻到雨的味道啦，出门带把伞会安心些{details}。',
        snow: '{location} 现在 {temperature}{unit}，{condition}。天气冷冷的，记得把围巾和热饮都安排上{details}。',
        thunderstorm:
          '{location} 现在 {temperature}{unit}，{condition}。天空有点闹脾气，先待在安全的地方比较好{details}。',
        unknown:
          '{location} 现在 {temperature}{unit}，{condition}。天气有点捉摸不定，我会继续帮你盯着{details}。',
      },
      weatherCondition: {
        clear: '晴朗',
        cloudy: '多云',
        fog: '有雾',
        rain: '下雨',
        snow: '下雪',
        thunderstorm: '雷雨',
        unknown: '天气未知',
      },
    },
  },
  notification: {
    addedToDesktop: '已添加到桌面',
    viewDetailsWIP: '查看「{appName}」详情功能开发中',
  },
  confirmation: {
    title: '确认操作',
    confirm: '确认',
    cancel: '取消',
  },
  common: {
    status: {
      planned: '已规划',
      developing: '开发中',
      testing: '内测',
    },
  },
  app: {
    settings: {
      appName: '设置',
      menu: {
        personalization: '个性化',
        appearance: '外观',
        wallpaper: '壁纸',
        pet: '宠物',
        weather: '天气',
        language: '语言',
        system: '系统',
        about: '关于',
      },
      appearance: {
        label: '外观',
        description: '调整桌面和窗口外壳的显示主题。',
        themeLabel: '主题',
        themeDescription: '选择浅色或深色外观，设置会立即应用并在刷新后保留。',
        themeLight: '浅色',
        themeDark: '深色',
        desktopShell: '桌面系统外壳',
        desktopShellDescription:
          '这里展示公开站点的桌面化体验：应用窗口、快捷方式、应用库和基础偏好设置。',
      },
      wallpaper: {
        label: '壁纸',
        description: '选择桌面背景，设置会立即应用并在刷新后保留。',
        animalIsland: '动物岛屿',
        animalRiver: '薄荷溪谷',
        animalVillage: '暖灯村落',
        animalFriends: '动物伙伴',
      },
      pet: {
        label: '宠物',
        description: '选择桌面上陪伴你的宠物形象，设置会立即应用并在刷新后保留。',
        enablePet: '启用桌面宠物',
        enablePetDescription: '关闭后宠物不会显示在桌面上，但会保留当前选择。',
        goldenRetriever: '金毛',
        goldenRetrieverDescription: '活泼友好的金毛犬',
      },
      weather: {
        label: '天气',
        description: '把天气预报接入桌面宠物，宠物会根据晴雨冷热表现不同状态。',
        currentWeather: '当前天气',
        locationSummary: '天气位置：{location}',
        forecastSummary: '{temperature}{unit}，{condition}',
        noLocation: '正在尝试根据当前位置自动读取天气。',
        refresh: '刷新天气',
        loading: '正在刷新',
        manualLocation: '手动城市',
        searchPlaceholder: '输入城市名或 Adcode，例如 杭州',
        applyCity: '应用城市',
        cityHelp: '自动定位失败时再手动输入城市名或行政区划代码。',
        errorForecast: '天气读取失败',
        errorCityRequired: '请输入城市名或行政区划代码。',
      },
      language: {
        label: '语言',
        description: '选择界面显示的语言。',
        displayLanguage: '显示语言',
        displayLanguageDescription: '切换后会立即更新已打开窗口和应用库中的文案。',
        zh: '中文',
        en: 'English',
      },
      about: {
        label: '关于',
        description: '查看当前 PortalOS 构建的软件版本信息。',
        version: '软件版本',
      },
    },
    blog: {
      appName: '岛屿手账',
      journalTitle: '岛屿手账簿',
      searchPlaceholder: '搜索岛上的故事',
      copyCode: '复制代码',
      loading: '正在沿着小路寻找文章……',
      retry: '再试一次',
      empty: '这里还没有留下故事。',
      error: '文章读取失败',
      back: '返回手账',
      islandJournal: 'ISLAND JOURNAL',
      chooseTitle: '挑一篇故事吧',
      chooseDescription: '从左侧手账簿打开一篇岛屿记录。',
    },
    admin: {
      appName: '岛务管理',
      loginTitle: '岛务管理员报到',
      username: '管理员用户名',
      password: '管理员密码',
      login: '进入岛务处',
      welcome: '欢迎回来，{name}',
      logout: '退出',
      title: '标题',
      status: '状态',
      actions: '操作',
      edit: '编辑',
      draft: '草稿',
      published: '已发布',
      trashed: '回收站',
      newArticle: '写一篇新手账',
      empty: '暂时没有文章',
      articleTitle: '文章标题',
      slug: '文章地址 slug',
      summary: '文章摘要',
      markdown: '用 Markdown 写下岛上的故事……',
      save: '保存草稿',
      publish: '发布',
      unpublish: '撤回',
      delete: '移入回收站',
      trash: '打开回收站',
      backArticles: '返回文章',
      restore: '恢复',
      permanentDelete: '永久删除',
      preview: '预览',
      choose: '选择一篇文章，或开始新的手账。',
      copyCode: '复制代码',
      confirmTrash: '确定将文章移入回收站吗？',
      confirmPermanent: '永久删除后无法恢复，确定继续吗？',
      discard: '当前修改尚未保存，确定放弃吗？',
    },
  },
} as const

/** 将中文资源的字面量值拓宽为字符串，同时保留完整键结构。 */
type LocaleShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : LocaleShape<T[K]>
}

/** PortalOS 国际化资源的唯一结构定义。 */
export type LocaleSchema = LocaleShape<typeof zh>

export default zh
