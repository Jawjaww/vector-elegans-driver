/** Whether a push payload should open the driver home (offer overlay). */
export function shouldOpenHomeFromPushData(
  data: Record<string, unknown>,
): boolean {
  const type = typeof data.type === 'string' ? data.type : null;
  const rideId = typeof data.ride_id === 'string' ? data.ride_id : null;
  return type === 'ride_offer' || Boolean(rideId);
}
