import db from "@helper/db";

export const getCurrentActiveJam = async () => {
  const jams = await db.jam.findMany({
    where: { isActive: true },
    include: {
      users: true,
      games: {
        include: {
          ratings: true,
          ratingCategories: true,
          tracks: true,
        },
      },
    },
  });

  // Get current time in UTC
  const now = new Date().toISOString();
  // console.log("Current UTC time:", now);
  // console.log("Number of active jams:", jams.length);

  let futureJam = null;

  let i = 0;
  for (const jam of jams) {
    // Convert jam.startTime to UTC if it isn't already
    const startTimeUTC = new Date(jam.startTime).toISOString();

    // Calculate all phase times in UTC
    const startOfSuggestionsTime = new Date(
      new Date(startTimeUTC).getTime() -
        jam.suggestionHours * 60 * 60 * 1000 -
        jam.slaughterHours * 60 * 60 * 1000 -
        jam.votingHours * 60 * 60 * 1000
    ).toISOString();

    const suggestionEnd = new Date(
      new Date(startOfSuggestionsTime).getTime() +
        jam.suggestionHours * 60 * 60 * 1000
    ).toISOString();

    const slaughterEnd = new Date(
      new Date(suggestionEnd).getTime() + jam.slaughterHours * 60 * 60 * 1000
    ).toISOString();

    const votingEnd = new Date(
      new Date(slaughterEnd).getTime() + jam.votingHours * 60 * 60 * 1000
    ).toISOString();

    const jammingEnd = new Date(
      new Date(votingEnd).getTime() + jam.jammingHours * 60 * 60 * 1000
    ).toISOString();

    const submissionEnd = new Date(
      new Date(jammingEnd).getTime() + jam.submissionHours * 60 * 60 * 1000
    ).toISOString();

    const ratingEnd = new Date(
      new Date(submissionEnd).getTime() + jam.ratingHours * 60 * 60 * 1000
    ).toISOString();

    // console.log("Phase times (UTC):");
    // console.log("Start of Suggestions:", startOfSuggestionsTime);
    // console.log("End of Suggestions:", suggestionEnd);
    // console.log("End of Slaughter:", slaughterEnd);
    // console.log("End of Voting:", votingEnd);
    // console.log("End of Jamming:", jammingEnd);
    // console.log("End of Submission:", submissionEnd);
    // console.log("End of Rating:", ratingEnd);
    // console.log("=======");

    i++;
    //console.log(i);
    if (now < ratingEnd) {
      //console.log("checking  " + jam.id);
      if (!futureJam || jam.startTime < futureJam.startTime) {
        //if (futureJam) console.log("from " + futureJam.id);
        futureJam = jam;
        //console.log("future jam changed to " + jam.id);
      } else continue;
    }

    if (now >= startOfSuggestionsTime && now < suggestionEnd)
      return { phase: "Suggestion", futureJam };
    if (now >= suggestionEnd && now < slaughterEnd)
      return { phase: "Elimination", futureJam };
    if (now >= slaughterEnd && now < votingEnd)
      return { phase: "Voting", futureJam };
    if (now >= votingEnd && now < jammingEnd)
      return { phase: "Jamming", futureJam };
    if (now >= jammingEnd && now < submissionEnd)
      return { phase: "Submission", futureJam };
    if (now >= submissionEnd && now < ratingEnd)
      return { phase: "Rating", futureJam };
  }

  if (futureJam) {
    return { phase: "Upcoming Jam", futureJam };
  }

  return { phase: "No Active Jams" };
};

export const checkJamParticipation = async (req, res, next) => {
  const username = res.locals.userSlug; // From your auth middleware

  try {
    // Get active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).send("No active jam found.");
    }

    // Check if user has joined this jam
    const hasJoined = await db.jam.findFirst({
      where: {
        id: activeJam.futureJam.id,
        users: {
          some: {
            slug: username,
          },
        },
      },
    });

    if (!hasJoined) {
      return res
        .status(403)
        .send("You must join the jam first to participate.");
    }

    next();
  } catch (error) {
    console.error("Error checking jam participation:", error);
    res.status(500).send("Internal Server Error");
  }
};
