import React from 'react';

export default function TeamsSelector({ availableTeams, selectedTeams, onChange }) {
  return (
    <div className="flex space-x-2">
      {availableTeams.map(team => {
        const isSelected = selectedTeams.includes(team.id);
        return (
          <button
            key={team.id}
            type="button"
            onClick={() => {
              const next = isSelected
                ? selectedTeams.filter(id => id !== team.id)
                : [...selectedTeams, team.id];
              console.log('TeamsSelector: toggled team', team.id, team.name, 'wasSelected', isSelected, 'newSelection', next);
              onChange(next);
            }}
            className={`px-3 py-1 rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            {team.logo && (
              <img
                src={team.logo}
                alt={team.name}
                className="w-6 h-6 object-contain inline-block mr-1"
              />
            )}
            {team.name}
          </button>
        );
      })}
    </div>
  );
} 