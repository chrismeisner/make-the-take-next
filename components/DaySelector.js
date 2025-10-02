import { } from 'react';
import { computeAvailableDays, getDayLabels } from '../lib/dayGrouping';

export default function DaySelector({ selectedDay, onDayChange, packs = [], accent = 'blue' }) {
  const dayLabels = getDayLabels();
  const daysToShow = ['all', 'today', 'yesterday', 'tomorrow'];

  const getPackCount = (day) => {
    const list = Array.isArray(packs) ? packs : [];
    if (day === 'all') return list.length;
    return list.filter((p) => {
      return (p && (p.eventTime || p.packOpenTime || p.packCloseTime)) && (computeAvailableDays([p]).includes(day));
    }).length;
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Pack Feed</h1>
          
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-600 mr-3">Show:</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {daysToShow.map(day => {
                const packCount = getPackCount(day);
                const isSelected = day === selectedDay;
                
                return (
                  <button
                    key={day}
                    onClick={() => onDayChange(day)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                      isSelected
                        ? `bg-blue-500 text-white shadow-sm`
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                    }`}
                  >
                    <span className="flex items-center space-x-2">
                      <span>{day === 'all' ? 'All' : (dayLabels[day] || day)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        isSelected 
                          ? 'bg-white bg-opacity-20' 
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {packCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
