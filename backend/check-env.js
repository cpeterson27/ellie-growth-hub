const k = process.env.MONDAY_API_KEY;
console.log('exists:', !!k);
console.log('length:', k?.length);
console.log('first10:', k?.slice(0,10));
console.log('last5:', k?.slice(-5));
