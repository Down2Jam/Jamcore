import { PageVersion } from "@prisma/client";

export const jamAndPostJamVersions: PageVersion[] = [
  PageVersion.JAM,
  PageVersion.POST_JAM,
];

export const gameSummarySelect = {
  id: true,
  slug: true,
  category: true,
  pages: {
    where: { version: "JAM" },
    include: {
      downloadLinks: true,
    },
    take: 1,
  },
  downloadLinks: {
    select: {
      id: true,
      url: true,
      platform: true,
    },
  },
  jam: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
} as const;

export const trackSummarySelect = {
  id: true,
  name: true,
  slug: true,
  url: true,
  allowBackgroundUse: true,
  allowBackgroundUseAttribution: true,
  allowDownload: true,
  license: true,
  composer: { select: { name: true, slug: true } },
  gamePage: {
    select: {
      version: true,
      gameId: true,
      game: {
        select: {
          slug: true,
          jamId: true,
          pages: {
            where: { version: "JAM" },
            select: { name: true, thumbnail: true },
            take: 1,
          },
        },
      },
    },
  },
} as const;

export const requestUserBaseSelect = {
  ratings: {
    select: {
      value: true,
      userId: true,
      gamePageId: true,
      categoryId: true,
      gamePage: {
        select: {
          version: true,
          gameId: true,
        },
      },
    },
  },
  trackRatings: {
    select: {
      value: true,
      trackId: true,
      categoryId: true,
    },
  },
  id: true,
  name: true,
  bio: true,
  short: true,
  profilePicture: true,
  createdAt: true,
  slug: true,
  mod: true,
  admin: true,
  jams: true,
  bannerPicture: true,
  email: true,
  twitch: true,
  primaryRoles: true,
  secondaryRoles: true,
  teams: {
    include: {
      game: true,
    },
  },
  teamInvites: {
    include: {
      team: {
        include: {
          owner: true,
        },
      },
    },
  },
  ownedTeams: {
    include: {
      applications: {
        include: {
          user: true,
        },
      },
    },
  },
} as const;

export const requestUserDetailSelect = {
  ...requestUserBaseSelect,
  profileBackground: true,
  emotePrefix: true,
  hideRatings: true,
  autoHideRatingsWhileStreaming: true,
  receivedNotifications: {
      where: {
        readAt: null,
        archivedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
      teamApplication: {
        include: {
          user: true,
          team: true,
        },
      },
      teamInvite: {
        include: {
          user: true,
          team: {
            include: {
              owner: true,
            },
          },
        },
      },
      comment: {
        include: {
          game: true,
          track: true,
          post: true,
          author: true,
          comment: {
            include: {
              game: true,
              track: true,
              post: true,
              author: true,
              comment: {
                include: {
                  game: true,
                  track: true,
                  post: true,
                  author: true,
                },
              },
            },
          },
        },
      },
      game: true,
      post: true,
      track: true,
    },
  },
  pronouns: true,
  links: true,
  linkLabels: true,
} as const;

export const requestUserOptionalSelect = {
  ...requestUserBaseSelect,
} as const;

export const teamGameInclude = {
  jam: true,
  downloadLinks: true,
  pages: {
    where: {
      version: {
        in: jamAndPostJamVersions,
      },
    },
    include: {
      downloadLinks: true,
    },
  },
} as const;

export const gameListingPageInclude = {
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  downloadLinks: true,
} as const;

export const gameListingSummaryInclude = {
  jam: true,
  ratingCategories: true,
  downloadLinks: true,
  tags: true,
  flags: true,
  pages: {
    where: {
      version: {
        in: jamAndPostJamVersions,
      },
    },
    include: gameListingPageInclude,
  },
} as const;

export const gameListingInclude = {
  jam: true,
  ratingCategories: true,
  downloadLinks: true,
  tags: true,
  flags: true,
  pages: {
    where: {
      version: {
        in: jamAndPostJamVersions,
      },
    },
    include: gameListingPageInclude,
  },
  ratings: {
    select: {
      id: true,
      value: true,
      userId: true,
      categoryId: true,
      gameId: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      gamePage: {
        select: {
          version: true,
        },
      },
      user: {
        select: {
          teams: {
            select: {
              game: {
                select: {
                  published: true,
                  ratingCategories: {
                    select: {
                      id: true,
                    },
                  },
                  jamId: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  },
  team: {
    select: {
      users: {
        select: {
          id: true,
          gamePageAchievements: {
            select: {
              gamePage: {
                select: {
                  version: true,
                  gameId: true,
                  game: {
                    select: {
                      jamId: true,
                    },
                  },
                },
              },
            },
          },
          scores: {
            select: {
              leaderboard: {
                select: {
                  gamePageId: true,
                  name: true,
                  type: true,
                  onlyBest: true,
                  maxUsersShown: true,
                  decimalPlaces: true,
                  gamePage: {
                    select: {
                      version: true,
                      gameId: true,
                      game: {
                        select: {
                          jamId: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          comments: {
            select: {
              gameId: true,
              game: {
                select: {
                  jamId: true,
                },
              },
              likes: {
                select: {
                  userId: true,
                  id: true,
                },
              },
            },
          },
          ratings: {
            select: {
              gameId: true,
              gamePage: {
                select: {
                  version: true,
                },
              },
              game: {
                select: {
                  jamId: true,
                  ratingCategories: true,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const targetUserBaseSelect = {
  id: true,
  name: true,
  bio: true,
  short: true,
  profilePicture: true,
  profileBackground: true,
  createdAt: true,
  slug: true,
  mod: true,
  admin: true,
  emotePrefix: true,
  hideRatings: true,
  autoHideRatingsWhileStreaming: true,
  jams: true,
  bannerPicture: true,
  pronouns: true,
  links: true,
  linkLabels: true,
  recommendedGameOverrideIds: true,
  recommendedGameHiddenIds: true,
  recommendedTrackOverrideIds: true,
  recommendedTrackHiddenIds: true,
  ratings: {
    select: {
      gameId: true,
      categoryId: true,
      value: true,
      userId: true,
      updatedAt: true,
      gamePage: {
        select: {
          version: true,
        },
      },
      game: {
        select: {
          jamId: true,
          ratingCategories: { select: { id: true } },
        },
      },
    },
  },
  trackRatings: {
    select: {
      trackId: true,
      categoryId: true,
      value: true,
      userId: true,
      updatedAt: true,
      track: {
        select: {
          gamePage: {
            select: {
              game: {
                select: {
                  jamId: true,
                },
              },
            },
          },
        },
      },
    },
  },
  recommendedPosts: {
    select: {
      id: true,
      title: true,
      slug: true,
    },
  },
  userEmotes: {
    select: {
      id: true,
      slug: true,
      image: true,
      updatedAt: true,
    },
  },
  primaryRoles: true,
  secondaryRoles: true,
  teams: {
    select: {
      jamId: true,
      game: {
        include: teamGameInclude,
      },
    },
  },
} as const;

export const targetUserDetailSelect = {
  ...targetUserBaseSelect,
  gamePageTracks: {
    include: {
      composer: true,
      gamePage: {
        include: {
          game: {
            include: {
              jam: true,
              pages: true,
            },
          },
        },
      },
    },
  },
  posts: {
    include: {
      author: true,
      comments: true,
      likes: true,
      tags: true,
    },
  },
  comments: {
    include: {
      author: true,
      likes: true,
      game: true,
      post: true,
      comment: true,
    },
  },
  scores: {
    include: {
      user: true,
      leaderboard: {
        include: {
          gamePage: {
            include: {
              game: {
                include: {
                  pages: {
                    include: {
                      achievements: {
                        include: {
                          users: true,
                        },
                      },
                      leaderboards: true,
                      downloadLinks: true,
                    },
                  },
                },
              },
            },
          },
          scores: {
            include: {
              user: true,
            },
          },
        },
      },
    },
  },
  gamePageAchievements: {
    include: {
      gamePage: {
        include: {
          game: {
            include: {
              pages: {
                include: {
                  achievements: {
                    include: {
                      users: true,
                    },
                  },
                  leaderboards: true,
                  downloadLinks: true,
                },
              },
              ratings: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      },
      users: true,
    },
  },
} as const;
