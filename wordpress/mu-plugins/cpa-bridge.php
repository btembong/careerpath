<?php
/**
 * Plugin Name: CPA Bridge
 * Plugin URI:  https://careerpathafrica.com
 * Description: Exposes REST endpoints for the CareerPath Africa portal to verify
 *              passwords, trigger password resets, and complete resets — none of
 *              which WordPress's default REST API supports natively.
 *              Includes a wp-admin Settings page so no file-manager access is needed.
 * Version:     1.1.0
 * Author:      CareerPath Africa
 *
 * Installation (wp-admin only — no FTP/file-manager needed):
 *   1. Zip this file as cpa-bridge.zip (the zip must contain cpa-bridge.php at its root).
 *   2. wp-admin → Plugins → Add New → Upload Plugin → choose the zip → Install Now → Activate.
 *   3. wp-admin → Settings → CPA Bridge → paste your bridge secret → Save.
 *   4. Copy the same secret into your NestJS .env as WP_BRIDGE_SECRET.
 *
 * Security model:
 *   - Every request carries the shared secret in the body.
 *   - Secret is stored in the WP options table (wp_options), NOT in plain-text PHP.
 *   - HTTPS is required in production.
 */

defined( 'ABSPATH' ) || exit;

// ── Secret resolution ────────────────────────────────────────────────────────
// Prefer the hard-coded constant (for setups that do have wp-config.php access),
// fall back to the option set via the Settings page.

function cpa_get_secret(): string {
    if ( defined( 'CPA_BRIDGE_SECRET' ) && CPA_BRIDGE_SECRET !== '' ) {
        return CPA_BRIDGE_SECRET;
    }
    return (string) get_option( 'cpa_bridge_secret', '' );
}

// ── REST routes ──────────────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {

    register_rest_route( 'cpa/v1', '/verify-password', [
        'methods'             => 'POST',
        'callback'            => 'cpa_verify_password',
        'permission_callback' => '__return_true',
        'args'                => [
            'email'    => [ 'required' => true, 'type' => 'string' ],
            'password' => [ 'required' => true, 'type' => 'string' ],
            'secret'   => [ 'required' => true, 'type' => 'string' ],
        ],
    ] );

    register_rest_route( 'cpa/v1', '/forgot-password', [
        'methods'             => 'POST',
        'callback'            => 'cpa_forgot_password',
        'permission_callback' => '__return_true',
        'args'                => [
            'email'  => [ 'required' => true, 'type' => 'string' ],
            'secret' => [ 'required' => true, 'type' => 'string' ],
        ],
    ] );

    register_rest_route( 'cpa/v1', '/reset-password', [
        'methods'             => 'POST',
        'callback'            => 'cpa_reset_password',
        'permission_callback' => '__return_true',
        'args'                => [
            'login'    => [ 'required' => true, 'type' => 'string' ],
            'key'      => [ 'required' => true, 'type' => 'string' ],
            'password' => [ 'required' => true, 'type' => 'string' ],
            'secret'   => [ 'required' => true, 'type' => 'string' ],
        ],
    ] );

    register_rest_route( 'cpa/v1', '/enroll-course', [
        'methods'             => 'POST',
        'callback'            => 'cpa_enroll_course',
        'permission_callback' => '__return_true',
        'args'                => [
            'user_id'   => [ 'required' => true, 'type' => 'integer' ],
            'course_id' => [ 'required' => true, 'type' => 'integer' ],
            'secret'    => [ 'required' => true, 'type' => 'string' ],
        ],
    ] );
} );

// ── Handlers ─────────────────────────────────────────────────────────────────

function cpa_verify_password( WP_REST_Request $req ): WP_REST_Response|WP_Error {
    if ( ! cpa_check_secret( $req ) ) {
        return new WP_Error( 'forbidden', 'Invalid bridge secret', [ 'status' => 403 ] );
    }

    $email    = sanitize_email( $req->get_param( 'email' ) );
    $password = $req->get_param( 'password' );

    $user = get_user_by( 'email', $email );
    if ( ! $user ) {
        return new WP_Error( 'unauthorized', 'Invalid credentials', [ 'status' => 401 ] );
    }

    if ( ! wp_check_password( $password, $user->user_pass, $user->ID ) ) {
        return new WP_Error( 'unauthorized', 'Invalid credentials', [ 'status' => 401 ] );
    }

    $avatar_urls = [];
    foreach ( [ 24, 48, 96 ] as $size ) {
        $avatar_urls[ (string) $size ] = get_avatar_url( $user->ID, [ 'size' => $size ] );
    }

    return new WP_REST_Response( [
        'id'          => $user->ID,
        'email'       => $user->user_email,
        'name'        => $user->display_name,
        'first_name'  => $user->first_name,
        'last_name'   => $user->last_name,
        'roles'       => array_values( $user->roles ),
        'avatar_urls' => $avatar_urls,
    ], 200 );
}

function cpa_forgot_password( WP_REST_Request $req ): WP_REST_Response|WP_Error {
    if ( ! cpa_check_secret( $req ) ) {
        return new WP_Error( 'forbidden', 'Invalid bridge secret', [ 'status' => 403 ] );
    }

    $email = sanitize_email( $req->get_param( 'email' ) );
    $user  = get_user_by( 'email', $email );

    // Always return success — never confirm whether an email is registered
    if ( $user ) {
        retrieve_password( $user->user_login );
    }

    return new WP_REST_Response( [ 'ok' => true ], 200 );
}

function cpa_reset_password( WP_REST_Request $req ): WP_REST_Response|WP_Error {
    if ( ! cpa_check_secret( $req ) ) {
        return new WP_Error( 'forbidden', 'Invalid bridge secret', [ 'status' => 403 ] );
    }

    $login    = sanitize_text_field( $req->get_param( 'login' ) );
    $key      = sanitize_text_field( $req->get_param( 'key' ) );
    $password = $req->get_param( 'password' );

    $user = check_password_reset_key( $key, $login );
    if ( is_wp_error( $user ) ) {
        return new WP_Error( 'invalid_key', 'Password reset link is invalid or has expired', [ 'status' => 400 ] );
    }

    reset_password( $user, $password );

    return new WP_REST_Response( [ 'ok' => true ], 200 );
}

function cpa_enroll_course( WP_REST_Request $req ): WP_REST_Response|WP_Error {
    if ( ! cpa_check_secret( $req ) ) {
        return new WP_Error( 'forbidden', 'Invalid bridge secret', [ 'status' => 403 ] );
    }

    $user_id   = (int) $req->get_param( 'user_id' );
    $course_id = (int) $req->get_param( 'course_id' );

    $user = get_user_by( 'ID', $user_id );
    if ( ! $user ) {
        return new WP_Error( 'not_found', 'User not found', [ 'status' => 404 ] );
    }

    // LearnDash
    if ( function_exists( 'ld_update_course_access' ) ) {
        ld_update_course_access( $user_id, $course_id );
        return new WP_REST_Response( [ 'ok' => true, 'lms' => 'learndash' ], 200 );
    }

    // LifterLMS
    if ( function_exists( 'llms_enroll_student' ) ) {
        llms_enroll_student( $user_id, $course_id, 'cpa_portal' );
        return new WP_REST_Response( [ 'ok' => true, 'lms' => 'lifterlms' ], 200 );
    }

    // WP Courseware
    if ( function_exists( 'WPCW_users_addUserToCourse' ) ) {
        WPCW_users_addUserToCourse( $user_id, $course_id );
        return new WP_REST_Response( [ 'ok' => true, 'lms' => 'wpcourseware' ], 200 );
    }

    // Fallback — fire a custom action for site-specific handlers
    do_action( 'cpa_enroll_user_in_course', $user_id, $course_id );
    return new WP_REST_Response( [ 'ok' => true, 'lms' => 'custom' ], 200 );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function cpa_check_secret( WP_REST_Request $req ): bool {
    $secret = cpa_get_secret();
    if ( $secret === '' ) {
        error_log( '[CPA Bridge] Bridge secret is not configured. Set it at Settings → CPA Bridge.' );
        return false;
    }
    return hash_equals( $secret, (string) $req->get_param( 'secret' ) );
}

// ── wp-admin Settings page ───────────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_options_page(
        'CPA Bridge Settings',
        'CPA Bridge',
        'manage_options',
        'cpa-bridge',
        'cpa_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'cpa_bridge_group', 'cpa_bridge_secret', [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ] );
} );

function cpa_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }

    $secret  = cpa_get_secret();
    $is_set  = $secret !== '';
    $test_ok = null;

    // Quick connectivity self-test when the form is submitted with test=1
    if ( isset( $_GET['test'] ) && $is_set ) {
        $response = wp_remote_post( rest_url( 'cpa/v1/verify-password' ), [
            'body'    => wp_json_encode( [ 'email' => 'test@example.com', 'password' => 'x', 'secret' => $secret ] ),
            'headers' => [ 'Content-Type' => 'application/json' ],
            'timeout' => 5,
        ] );
        // A 401 (bad credentials) means the endpoint is alive and the secret was accepted at the right layer
        $code    = wp_remote_retrieve_response_code( $response );
        $test_ok = ( $code === 401 || $code === 200 );
    }
    ?>
    <div class="wrap">
        <h1>CPA Bridge Settings</h1>

        <?php if ( $test_ok === true ) : ?>
            <div class="notice notice-success"><p><strong>Connection test passed.</strong> The bridge endpoint is reachable and the secret is accepted.</p></div>
        <?php elseif ( $test_ok === false ) : ?>
            <div class="notice notice-error"><p><strong>Connection test failed.</strong> The endpoint did not respond as expected. Check that the plugin is active and HTTPS is configured.</p></div>
        <?php endif; ?>

        <form method="post" action="options.php">
            <?php settings_fields( 'cpa_bridge_group' ); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="cpa_bridge_secret">Bridge Secret</label></th>
                    <td>
                        <input type="password" id="cpa_bridge_secret" name="cpa_bridge_secret"
                               value="<?php echo esc_attr( get_option( 'cpa_bridge_secret', '' ) ); ?>"
                               class="regular-text" autocomplete="new-password" />
                        <p class="description">
                            A long random string shared only between this plugin and the NestJS API.<br>
                            Set the same value as <code>WP_BRIDGE_SECRET</code> in your NestJS <code>.env</code>.<br>
                            <?php if ( $is_set ) : ?>
                                <span style="color:#2ea44f">&#10003; Secret is set.</span>
                                &nbsp;&nbsp;<a href="<?php echo esc_url( add_query_arg( 'test', '1' ) ); ?>">Run connection test</a>
                            <?php else : ?>
                                <span style="color:#d63638">&#10007; Secret is not set — the bridge will reject all requests.</span>
                            <?php endif; ?>
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Save Secret' ); ?>
        </form>

        <hr>
        <h2>Next steps</h2>
        <ol>
            <li>Generate a strong random secret (e.g. 40+ random characters) and paste it above.</li>
            <li>Set the same value as <code>WP_BRIDGE_SECRET=your-secret</code> in your NestJS <code>.env</code>.</li>
            <li>
                Create a WordPress <strong>Application Password</strong> for your admin account:<br>
                <a href="<?php echo esc_url( admin_url( 'profile.php#application-passwords-section' ) ); ?>">
                    Users → Your Profile → Application Passwords
                </a><br>
                Name it <em>CPA Portal API</em>, copy the generated password, and set it as<br>
                <code>WP_ADMIN_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx</code> in your NestJS <code>.env</code>.
            </li>
            <li>Set <code>WP_BASE_URL=https://careerpathafrica.com</code> and <code>WP_ADMIN_USER=your_admin_username</code> in your NestJS <code>.env</code>.</li>
            <li>Click <em>Run connection test</em> above to confirm the bridge is live.</li>
        </ol>
    </div>
    <?php
}
