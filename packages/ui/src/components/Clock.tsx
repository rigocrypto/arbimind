'use client';

import { useEffect, useState } from 'react';

export function Clock() {
	const [time, setTime] = useState('');

	useEffect(() => {
		const update = () => setTime(new Date().toLocaleTimeString());
		update();
		const id = setInterval(update, 1000);
		return () => clearInterval(id);
	}, []);

	return <span suppressHydrationWarning>{time || '—'}</span>;
}
