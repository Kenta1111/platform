// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import TeamStore from 'stores/team_store.jsx';
import UserStore from 'stores/user_store.jsx';
import ChannelStore from 'stores/channel_store.jsx';
import * as ChannelUtils from 'utils/channel_utils.jsx';
import PreferenceStore from 'stores/preference_store.jsx';

import {loadProfilesForSidebar, loadNewDMIfNeeded, loadNewGMIfNeeded} from 'actions/user_actions.jsx';
import {trackEvent} from 'actions/diagnostics_actions.jsx';

import * as UserAgent from 'utils/user_agent.jsx';
import * as Utils from 'utils/utils.jsx';
import {Constants, Preferences} from 'utils/constants.jsx';

import {browserHistory} from 'react-router/es6';

import store from 'stores/redux_store.jsx';
const dispatch = store.dispatch;
const getState = store.getState;

import * as ChannelActions from 'mattermost-redux/actions/channels';
import {savePreferences, deletePreferences} from 'mattermost-redux/actions/preferences';
import {Client4} from 'mattermost-redux/client';

import {getMyChannelMemberships} from 'mattermost-redux/selectors/entities/channels';

export function goToChannel(channel) {
    if (channel.fake) {
        const user = UserStore.getProfileByUsername(channel.display_name);
        if (!user) {
            return;
        }
        openDirectChannelToUser(
            user.id,
            () => {
                browserHistory.push(TeamStore.getCurrentTeamRelativeUrl() + '/channels/' + channel.name);
            },
            null
        );
    } else {
        browserHistory.push(TeamStore.getCurrentTeamRelativeUrl() + '/channels/' + channel.name);
    }
}

export function executeCommand(message, args, success, error) {
    let msg = message;

    msg = msg.substring(0, msg.indexOf(' ')).toLowerCase() + msg.substring(msg.indexOf(' '), msg.length);

    if (message.indexOf('/shortcuts') !== -1) {
        if (UserAgent.isMobile()) {
            const err = {message: Utils.localizeMessage('create_post.shortcutsNotSupported', 'Keyboard shortcuts are not supported on your device')};
            error(err);
            return;
        } else if (Utils.isMac()) {
            msg += ' mac';
        } else if (message.indexOf('mac') !== -1) {
            msg = '/shortcuts';
        }
    }

    Client4.executeCommand(msg, args).then(success).catch(
        (err) => {
            if (error) {
                error(err);
            }
        }
    );
}

export function setChannelAsRead(channelIdParam) {
    const channelId = channelIdParam || ChannelStore.getCurrentId();
    ChannelActions.viewChannel(channelId)(dispatch, getState);
    ChannelStore.resetCounts([channelId]);
    ChannelStore.emitChange();
    if (channelId === ChannelStore.getCurrentId()) {
        ChannelStore.emitLastViewed(Number.MAX_VALUE, false);
    }
}

export function addUserToChannel(channelId, userId, success, error) {
    ChannelActions.addChannelMember(channelId, userId)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.addChannelMember.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function removeUserFromChannel(channelId, userId, success, error) {
    ChannelActions.removeChannelMember(channelId, userId)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.removeChannelMember.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function makeUserChannelAdmin(channelId, userId, success, error) {
    ChannelActions.updateChannelMemberRoles(channelId, userId, 'channel_user channel_admin')(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.updateChannelMember.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function makeUserChannelMember(channelId, userId, success, error) {
    ChannelActions.updateChannelMemberRoles(channelId, userId, 'channel_user')(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.updateChannelMember.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function openDirectChannelToUser(userId, success, error) {
    const channelName = Utils.getDirectChannelName(UserStore.getCurrentId(), userId);
    const channel = ChannelStore.getByName(channelName);

    if (channel) {
        trackEvent('api', 'api_channels_join_direct');
        PreferenceStore.setPreference(Preferences.CATEGORY_DIRECT_CHANNEL_SHOW, userId, 'true');
        loadProfilesForSidebar();

        const currentUserId = UserStore.getCurrentId();
        savePreferences(currentUserId, [{user_id: currentUserId, category: Preferences.CATEGORY_DIRECT_CHANNEL_SHOW, name: userId, value: 'true'}])(dispatch, getState);

        if (success) {
            success(channel, true);
        }

        return;
    }

    ChannelActions.createDirectChannel(UserStore.getCurrentId(), userId)(dispatch, getState).then(
        (data) => {
            loadProfilesForSidebar();
            if (data && success) {
                success(data, false);
            } else if (data == null && error) {
                browserHistory.push(TeamStore.getCurrentTeamUrl() + '/channels/' + channelName);
                const serverError = getState().requests.channels.createChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function openGroupChannelToUsers(userIds, success, error) {
    ChannelActions.createGroupChannel(userIds)(dispatch, getState).then(
        (data) => {
            loadProfilesForSidebar();
            if (data && success) {
                success(data, false);
            } else if (data == null && error) {
                browserHistory.push(TeamStore.getCurrentTeamUrl());
                const serverError = getState().requests.channels.createChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function markFavorite(channelId) {
    trackEvent('api', 'api_channels_favorited');
    const currentUserId = UserStore.getCurrentId();
    savePreferences(currentUserId, [{user_id: currentUserId, category: Preferences.CATEGORY_FAVORITE_CHANNEL, name: channelId, value: 'true'}])(dispatch, getState);
}

export function unmarkFavorite(channelId) {
    trackEvent('api', 'api_channels_unfavorited');
    const currentUserId = UserStore.getCurrentId();

    const pref = {
        user_id: currentUserId,
        category: Preferences.CATEGORY_FAVORITE_CHANNEL,
        name: channelId
    };

    deletePreferences(currentUserId, [pref])(dispatch, getState);
}

export function loadChannelsForCurrentUser() {
    ChannelActions.fetchMyChannelsAndMembers(TeamStore.getCurrentId())(dispatch, getState).then(
        () => {
            loadDMsAndGMsForUnreads();
        }
    );
}

export function loadDMsAndGMsForUnreads() {
    const unreads = ChannelStore.getUnreadCounts();
    for (const id in unreads) {
        if (!unreads.hasOwnProperty(id)) {
            continue;
        }

        if (unreads[id].msgs > 0 || unreads[id].mentions > 0) {
            const channel = ChannelStore.get(id);
            if (channel && channel.type === Constants.DM_CHANNEL) {
                loadNewDMIfNeeded(channel.id);
            } else if (channel && channel.type === Constants.GM_CHANNEL) {
                loadNewGMIfNeeded(channel.id);
            }
        }
    }
}

export function joinChannel(channel, success, error) {
    ChannelActions.joinChannel(UserStore.getCurrentId(), null, channel.id)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.joinChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function updateChannel(channel, success, error) {
    ChannelActions.updateChannel(channel)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.updateChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function searchMoreChannels(term, success, error) {
    ChannelActions.searchChannels(TeamStore.getCurrentId(), term)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                const myMembers = getMyChannelMemberships(getState());
                const channels = data.filter((c) => !myMembers[c.id]);
                success(channels);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.getChannels.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function autocompleteChannels(term, success, error) {
    ChannelActions.searchChannels(TeamStore.getCurrentId(), term)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.getChannels.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function updateChannelNotifyProps(data, options, success, error) {
    ChannelActions.updateChannelNotifyProps(data.user_id, data.channel_id, Object.assign({}, data, options))(dispatch, getState).then(
        (result) => {
            if (result && success) {
                success(result);
            } else if (result == null && error) {
                const serverError = getState().requests.channels.updateChannelNotifyProps.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function createChannel(channel, success, error) {
    ChannelActions.createChannel(channel)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.createChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function updateChannelPurpose(channelId, purpose, success, error) {
    ChannelActions.patchChannel(channelId, {purpose})(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.updateChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function updateChannelHeader(channelId, header, success, error) {
    ChannelActions.patchChannel(channelId, {header})(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.updateChannel.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function getChannelMembersForUserIds(channelId, userIds, success, error) {
    ChannelActions.getChannelMembersByIds(channelId, userIds)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.members.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}

export function leaveChannel(channelId, success) {
    ChannelActions.leaveChannel(channelId)(dispatch, getState).then(
        () => {
            if (ChannelUtils.isFavoriteChannelId(channelId)) {
                unmarkFavorite(channelId);
            }

            const townsquare = ChannelStore.getByName('town-square');
            browserHistory.push(TeamStore.getCurrentTeamRelativeUrl() + '/channels/' + townsquare.name);

            if (success) {
                success();
            }
        }
    );
}

export function deleteChannel(channelId, success, error) {
    ChannelActions.deleteChannel(channelId)(dispatch, getState).then(
        (data) => {
            if (data && success) {
                success(data);
            } else if (data == null && error) {
                const serverError = getState().requests.channels.members.error;
                error({id: serverError.server_error_id, ...serverError});
            }
        }
    );
}
