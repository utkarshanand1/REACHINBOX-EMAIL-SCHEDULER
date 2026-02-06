import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from './config';

export type AuthUser = {
  id: string;
  displayName: string;
  email: string;
  photo?: string;
};

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user: AuthUser, done) => {
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl
    },
    (_accessToken, _refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value ?? '';
      const photo = profile.photos?.[0]?.value;
      const user: AuthUser = {
        id: profile.id,
        displayName: profile.displayName,
        email,
        photo
      };
      return done(null, user);
    }
  )
);

export default passport;
