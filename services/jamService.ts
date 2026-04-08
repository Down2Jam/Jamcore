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
          tracks: {
            include: {
              ratings: true,
            },
          },
        },
      },
    },
  });

  const sortedJams = [...jams].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const now = new Date().toISOString();

  function getNextJamAfter(jamId: number) {
    const currentIndex = sortedJams.findIndex((jam) => jam.id === jamId);
    if (currentIndex < 0) return null;
    return sortedJams[currentIndex + 1] ?? null;
  }

  let upcomingJam = null;

  for (const jam of sortedJams) {
    const postJamRefinementHours = jam.postJamRefinementHours ?? 14 * 24;
    const postJamRatingHours = jam.postJamRatingHours ?? 14 * 24;

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

    const postJamRefinementEnd = new Date(
      new Date(ratingEnd).getTime() + postJamRefinementHours * 60 * 60 * 1000
    ).toISOString();

    const postJamRatingEnd = new Date(
      new Date(postJamRefinementEnd).getTime() +
        postJamRatingHours * 60 * 60 * 1000
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

    if (now < postJamRatingEnd) {
      if (!upcomingJam) {
        upcomingJam = jam;
      }
    }

    if (now >= startOfSuggestionsTime && now < suggestionEnd)
      return { phase: "Suggestion", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= suggestionEnd && now < slaughterEnd)
      return { phase: "Elimination", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= slaughterEnd && now < votingEnd)
      return { phase: "Voting", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= votingEnd && now < jammingEnd)
      return { phase: "Jamming", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= jammingEnd && now < submissionEnd)
      return { phase: "Submission", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= submissionEnd && now < ratingEnd)
      return { phase: "Rating", jam, nextJam: getNextJamAfter(jam.id) };
    if (now >= ratingEnd && now < postJamRefinementEnd)
      return {
        phase: "Post-Jam Refinement",
        jam,
        nextJam: getNextJamAfter(jam.id),
      };
    if (now >= postJamRefinementEnd && now < postJamRatingEnd)
      return {
        phase: "Post-Jam Rating",
        jam,
        nextJam: getNextJamAfter(jam.id),
      };
  }

  if (upcomingJam) {
    return { phase: "Upcoming Jam", jam: upcomingJam, nextJam: getNextJamAfter(upcomingJam.id) };
  }

  return { phase: "No Active Jams" };
};

export const checkJamParticipation = async (req, res, next) => {
  const username = res.locals.userSlug; // From your auth middleware

  try {
    // Get active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.jam) {
      return res.status(404).send("No active jam found.");
    }

    // Check if user has joined this jam
    const hasJoined = await db.jam.findFirst({
      where: {
        id: activeJam.jam.id,
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
