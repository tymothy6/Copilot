import { Copilot } from './copilot.tsx';

describe('processSticky()', () => { 
    it('should return a function', () => {
        const sticky = {
            id: 'sticky-id',
            text: 'This is a sticky note',
        };
        
        const accumulatedStickyTexts = ['Sticky 1', 'Sticky 2'];

        const newAccumulatedStickyTexts = Copilot(sticky, accumulatedStickyTexts);

        expect(newAccumulatedStickyTexts).toEqual([
            'Sticky 1',
            'Sticky 2',
            'This is a sticky note',
        ]);
    });
});
        