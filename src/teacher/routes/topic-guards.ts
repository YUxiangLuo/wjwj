export async function hasTopicOwnership(
    topicId: number,
    teacherId: number,
    lookup: (topicId: number, teacherId: number) => Promise<unknown | null>
) {
    if (!Number.isFinite(topicId) || !Number.isFinite(teacherId)) {
        return false;
    }

    const topic = await lookup(topicId, teacherId);
    return topic !== null;
}
