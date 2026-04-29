import { PageVersion } from "@prisma/client";

import db from "../../infra/db.js";
import type { ListingPageVersion } from "./schemas.js";

const listingGamePageInclude = {
  ratingCategories: true,
  majRatingCategories: true,
  tags: true,
  flags: true,
  downloadLinks: true,
} as const;

export function parseListingPageVersion(value: unknown): ListingPageVersion {
  return value === "POST_JAM" || value === "ALL" ? value : PageVersion.JAM;
}

export function getTrackOrderBy(sort: string) {
  switch (sort) {
    case "random":
    case "leastratings":
    case "danger":
    case "score":
    case "ratingbalance":
    case "karma":
    case "recommended":
      return undefined;
    case "oldest":
      return { id: "asc" as const };
    case "newest":
    default:
      return { id: "desc" as const };
  }
}

export async function loadTrackListingRecords({
  jamId,
  listingPageVersion,
  sort,
}: {
  jamId?: number;
  listingPageVersion: ListingPageVersion;
  sort: string;
}) {
  const where = {
    gamePage: {
      version:
        listingPageVersion === "ALL"
          ? {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            }
          : listingPageVersion,
      game: {
        published: true,
        ...(typeof jamId === "number" ? { jamId } : {}),
      },
    },
  };

  const orderBy = getTrackOrderBy(sort);

  return db.gamePageTrack.findMany({
    where,
    include: {
      composer: true,
      gamePage: {
        include: {
          game: {
            include: {
              team: {
                select: {
                  users: {
                    select: {
                      id: true,
                      comments: {
                        select: {
                          trackId: true,
                          likes: {
                            select: {
                              userId: true,
                              id: true,
                            },
                          },
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
                      trackRatings: {
                        select: {
                          trackId: true,
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
                    },
                  },
                },
              },
              jam: true,
              ratings: {
                select: {
                  value: true,
                  category: {
                    select: {
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
                              jamId: true,
                              category: true,
                              published: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              pages: {
                where: {
                  version: {
                    in: [PageVersion.JAM, PageVersion.POST_JAM],
                  },
                },
                include: listingGamePageInclude,
              },
            },
          },
        },
      },
      flags: true,
      links: true,
      comments: {
        select: {
          id: true,
          likes: {
            select: {
              userId: true,
            },
          },
        },
      },
      ratings: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              teams: {
                select: {
                  game: {
                    select: {
                      published: true,
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
      credits: {
        include: {
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
              profilePicture: true,
              short: true,
            },
          },
        },
      },
      tags: {
        include: {
          category: true,
        },
      },
    },
    orderBy,
  });
}

export async function loadTrackCategories() {
  return db.trackRatingCategory.findMany({
    where: {
      always: true,
    },
  });
}

export async function loadTrackRecommendationUsers(userIds: number[]) {
  return db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      recommendedTrackOverrideIds: true,
      recommendedTrackHiddenIds: true,
    },
  });
}

export async function loadTrackDetailCandidates(trackSlug: string) {
  return db.gamePageTrack.findMany({
    where: {
      slug: trackSlug,
      gamePage: {
        version: {
          in: [PageVersion.JAM, PageVersion.POST_JAM],
        },
        game: {
          published: true,
        },
      },
    },
    include: {
      composer: true,
      gamePage: {
        include: {
          game: {
            include: {
              team: {
                include: {
                  users: true,
                  owner: true,
                },
              },
              jam: true,
              pages: {
                where: {
                  version: {
                    in: [PageVersion.JAM, PageVersion.POST_JAM],
                  },
                },
                include: {
                  tracks: true,
                },
              },
            },
          },
        },
      },
      tags: {
        include: {
          category: true,
        },
      },
      flags: true,
      links: true,
      credits: {
        include: {
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
              profilePicture: true,
              short: true,
            },
          },
        },
      },
      comments: {
        include: {
          author: true,
          likes: true,
          commentReactions: {
            include: {
              reaction: true,
              user: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  profilePicture: true,
                },
              },
            },
          },
          children: {
            include: {
              author: true,
              likes: true,
              commentReactions: {
                include: {
                  reaction: true,
                  user: {
                    select: {
                      id: true,
                      slug: true,
                      name: true,
                      profilePicture: true,
                    },
                  },
                },
              },
              children: {
                include: {
                  author: true,
                  likes: true,
                  commentReactions: {
                    include: {
                      reaction: true,
                      user: {
                        select: {
                          id: true,
                          slug: true,
                          name: true,
                          profilePicture: true,
                        },
                      },
                    },
                  },
                  children: true,
                },
              },
            },
          },
        },
      },
      ratings: {
        include: {
          user: {
            select: {
              id: true,
              slug: true,
              name: true,
              profilePicture: true,
              teams: {
                select: {
                  game: {
                    select: {
                      jamId: true,
                      category: true,
                      published: true,
                    },
                  },
                },
              },
            },
          },
          category: true,
        },
      },
      timestampComments: {
        include: {
          author: {
            select: {
              id: true,
              slug: true,
              name: true,
              profilePicture: true,
            },
          },
        },
        orderBy: {
          timestamp: "asc",
        },
      },
    },
  });
}

export async function loadTrackScoreRecords({
  jamId,
  scorePageVersion,
}: {
  jamId: number;
  scorePageVersion: PageVersion;
}) {
  const scoreVersions =
    scorePageVersion === PageVersion.POST_JAM
      ? [PageVersion.JAM, PageVersion.POST_JAM]
      : [scorePageVersion];

  return db.gamePageTrack.findMany({
    where: {
      gamePage: {
        version: {
          in: scoreVersions,
        },
        game: {
          jamId,
          published: true,
        },
      },
    },
    include: {
      gamePage: {
        include: {
          game: {
            include: {
              team: {
                select: {
                  users: {
                    select: {
                      trackRatings: {
                        select: {
                          track: {
                            select: {
                              gamePage: {
                                select: {
                                  version: true,
                                  gameId: true,
                                  game: {
                                    select: {
                                      id: true,
                                      jamId: true,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ratings: {
        include: {
          category: true,
          user: {
            select: {
              teams: {
                select: {
                  game: {
                    select: {
                      jamId: true,
                      category: true,
                      published: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
